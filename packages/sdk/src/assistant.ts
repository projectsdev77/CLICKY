import { MarkerParser, RISKY_ACTION_RE, stripMarkers, type ActionResult, type AgentAction } from "@clicky/shared/client";
import type { ChatEvent, HandoffResponse, SdkInitResponse, SuggestionsResponse, VoiceTokenResponse } from "@clicky/shared";
import type { StruggleKind } from "./signals";
import { ApiError, postEventStream, postJson } from "./api";
import { AppActionRegistry } from "./agent/app-actions";
import { blockedReason, executeAction, needsConfirmation, settle } from "./agent/executor";
import { takeSnapshot, type PageSnapshot } from "./snapshot";
import { createListener, type Listener } from "./speech/listen";
import { createSpeaker, SentenceSplitter, type Speaker } from "./speech/speak";
import {
  clearPendingRun,
  getAnonymousId,
  loadSession,
  saveSession,
  savePendingRun,
  takePendingRun,
  type PendingRun,
  type SessionState,
} from "./storage";
import { mountWidget, type MessageHandle, type Widget } from "./widget";
import { t, type MessageKey } from "./i18n";

export interface Caller {
  projectKey: string;
  anonymousId: string;
  user: { userId: string; traits?: Record<string, string | number | boolean | null> } | null;
}

const ERROR_TEXT: Record<string, MessageKey> = {
  rate_limited: "rateLimited",
  origin_not_allowed: "notSetUp",
  unknown_run: "lostTask",
};

const YES_RE = /\b(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|please do|confirm|allow|go for it)\b/i;
const NO_RE = /\b(no|nope|don'?t|stop|cancel|wait|hold on)\b/i;

/** State for one question and everything the assistant does to answer it. */
interface Turn {
  controller: AbortController;
  inputMode: "voice" | "text";
  speaker: Speaker | null;
  spoke: boolean;
  runId: string | null;
}

/**
 * Runs the assistant inside the page: takes questions (typed, or spoken via
 * push-to-talk), sends them with a snapshot of the page, streams the reply into
 * the panel, points at what it mentions, reads replies aloud for spoken
 * questions, and in agent mode carries out actions (asking first for risky
 * ones) until the task is done.
 */
export class Assistant {
  readonly widget: Widget;
  readonly appActions = new AppActionRegistry();
  private session: SessionState;
  private listener: Listener | null;
  private speaker: Speaker | null;
  private listening: Promise<void> | null = null;
  private turn: Turn | null = null;
  private snapshot: PageSnapshot | null = null;
  private confirmByVoice: ((yes: boolean) => void) | null = null;
  private nudgesShown = 0;
  /** Lets the assistant record nudge events through the signal tracker. */
  recordEvent: (type: "nudge_shown" | "nudge_accepted", element: string | null) => void = () => {};
  private teardown: (() => void)[] = [];

  constructor(
    private config: SdkInitResponse,
    private apiUrl: string,
    private caller: () => Caller,
  ) {
    this.session = loadSession();
    const voice = config.behavior.voiceEnabled;
    this.listener = voice ? createListener(config.voice.stt, () => this.voiceToken()) : null;
    this.speaker = voice ? createSpeaker(config.voice.tts, (text, signal) => this.speechAudio(text, signal)) : null;

    this.widget = mountWidget(config, {
      onSubmit: (text) => void this.ask(text, "text"),
      onMicDown: () => void this.startListening(),
      onMicUp: () => void this.stopListening(),
      onMuteToggle: () => this.setMuted(!this.session.muted),
      onOpenChange: (open) => {
        this.session.open = open;
        this.save();
        if (!open) this.speaker?.stop();
        else void this.showSuggestions();
      },
    });
    this.widget.setVoiceAvailable(!!this.listener);
    this.widget.setMuted(this.session.muted);
    for (const m of this.session.messages) this.widget.addMessage(m.role, m.text);
    if (this.session.open) {
      this.widget.open();
      void this.showSuggestions();
    }
    this.bindHotkey();
    if (config.handoff.url) this.widget.setHandoff(config.handoff.label, () => void this.handoff());

    const pending = takePendingRun();
    if (pending && pending.conversationId === this.session.conversationId) void this.resume(pending);
  }

  destroy() {
    this.turn?.controller.abort();
    this.listener?.cancel();
    this.speaker?.stop();
    this.teardown.forEach((fn) => fn());
    this.widget.destroy();
  }

  /** Asks a question about the current page. */
  async ask(question: string, inputMode: "voice" | "text") {
    const turn = this.beginTurn(inputMode);
    this.widget.setSuggestions([], () => {});
    this.widget.addMessage("user", question);
    this.remember("user", question);
    this.snapshot = takeSnapshot(this.config.masking);
    const body = {
      ...this.caller(),
      conversationId: this.session.conversationId,
      message: question,
      inputMode,
      page: this.page(),
    };
    await this.drive(turn, postEventStream(`${this.apiUrl}/api/v1/chat`, body, turn.controller.signal));
  }

  private suggestionCache = new Map<string, SuggestionsResponse>();

  /** Starting points in an empty chat: the team's questions and common topics on this page. */
  private async showSuggestions() {
    if (this.session.messages.length || this.turn) return this.widget.setSuggestions([], () => {});
    const path = location.pathname;
    let data = this.suggestionCache.get(path);
    if (!data) {
      try {
        data = await postJson<SuggestionsResponse>(`${this.apiUrl}/api/v1/suggestions`, { ...this.caller(), path });
      } catch {
        return;
      }
      this.suggestionCache.set(path, data);
    }
    if (this.session.messages.length || location.pathname !== path) return;
    const items = [
      ...data.questions.map((q) => ({ label: q, ask: q })),
      ...data.topics.map((topic) => ({ label: topic, ask: t("helpWith", { topic }) })),
    ].slice(0, 5);
    this.widget.setSuggestions(items, (question) => void this.ask(question, "text"));
  }

  /** Someone seems stuck: offer help once per page (at most twice per visit) if the team turned this on. */
  nudge(kind: StruggleKind, element: string) {
    if (!this.config.proactive.enabled || this.widget.isOpen || this.turn || this.nudgesShown >= 2) return;
    const key = `clicky:nudged:${location.pathname}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // storage blocked: still nudge, the in-memory cap applies
    }
    this.nudgesShown++;
    const name = element.match(/"([^"]+)"/)?.[1];
    const text = kind === "rage_click" ? (name ? t("nudgeRage", { name }) : t("nudgeRageGeneric")) : t("nudgeForm");
    const question = kind === "rage_click" ? (name ? t("askRage", { name }) : t("askRageGeneric")) : t("askForm");
    this.recordEvent("nudge_shown", element || null);
    this.widget.showNudge(
      text,
      () => {
        this.recordEvent("nudge_accepted", element || null);
        void this.ask(question, "text");
      },
      () => {},
    );
  }

  /** "Talk to a person": hands the conversation to the team's support channel. */
  private async handoff() {
    const { url, label } = this.config.handoff;
    const conversationId = this.session.conversationId;
    let transcript = "";
    if (conversationId) {
      try {
        ({ transcript } = await postJson<HandoffResponse>(`${this.apiUrl}/api/v1/handoff`, { ...this.caller(), conversationId }));
      } catch {
        // still open the support channel
      }
    }
    if (url.startsWith("mailto:")) {
      const body = transcript ? `\n\n---\n${t("handoffBody", { name: this.config.appearance.assistantName })}\n${transcript}`.slice(0, 1800) : "";
      location.href = `${url}?subject=${encodeURIComponent(t("handoffSubject", { host: location.hostname }))}&body=${encodeURIComponent(body)}`;
    } else {
      const target = new URL(url);
      if (conversationId) target.searchParams.set("clicky_conversation", conversationId);
      window.open(target.toString(), "_blank", "noopener");
    }
    this.widget.addMessage("assistant", t("handoffOpening", { label }));
  }

  /** Stops whatever the assistant is doing. */
  stop() {
    this.turn?.controller.abort();
    this.speaker?.stop();
    this.widget.pointer.hide();
  }

  private beginTurn(inputMode: "voice" | "text"): Turn {
    this.stop();
    const turn: Turn = {
      controller: new AbortController(),
      inputMode,
      speaker: inputMode === "voice" && !this.session.muted ? this.speaker : null,
      spoke: false,
      runId: null,
    };
    this.turn = turn;
    this.widget.open();
    this.widget.setStatus("thinking");
    return turn;
  }

  /** Streams replies and carries out actions until the assistant is done (or the user stops it). */
  private async drive(turn: Turn, firstStream: AsyncGenerator<ChatEvent>) {
    let stream: AsyncGenerator<ChatEvent> | null = firstStream;
    try {
      while (stream) {
        const actions = await this.readReply(turn, stream);
        stream = null;
        if (!actions || turn.controller.signal.aborted) break;
        this.widget.setRunning(() => this.stop());
        const results = await this.runActions(turn, actions);
        if (turn.controller.signal.aborted) {
          void this.cancelRun(turn.runId!, results);
          break;
        }
        this.snapshot = takeSnapshot(this.config.masking);
        this.widget.setStatus("thinking");
        stream = postEventStream(
          `${this.apiUrl}/api/v1/chat/continue`,
          { ...this.caller(), runId: turn.runId, results, page: this.page() },
          turn.controller.signal,
        );
      }
    } catch (error) {
      if (!turn.controller.signal.aborted) {
        const code = error instanceof ApiError ? error.code : "";
        const text = t(ERROR_TEXT[code] ?? "offline");
        this.widget.addMessage("assistant", text);
      }
    }
    clearPendingRun();
    if (this.turn !== turn) return;
    this.widget.setRunning(null);
    const conversationId = this.session.conversationId;
    if (!turn.controller.signal.aborted && conversationId) {
      this.widget.showFeedback((rating) => {
        void postJson(`${this.apiUrl}/api/v1/feedback`, { ...this.caller(), conversationId, rating }).catch(() => {});
      });
    }
    if (turn.speaker && turn.spoke && !turn.controller.signal.aborted) {
      this.widget.setStatus("speaking", "");
      await turn.speaker.drain();
    }
    if (this.turn === turn) {
      this.turn = null;
      if (!this.listening) this.widget.setStatus("idle");
    }
  }

  /** Shows (and speaks) one streamed reply. Returns the actions the assistant asked for, if any. */
  private async readReply(turn: Turn, stream: AsyncGenerator<ChatEvent>): Promise<AgentAction[] | null> {
    const bubble = this.widget.addMessage("assistant");
    const parser = new MarkerParser();
    const splitter = new SentenceSplitter();
    const pendingPoints: string[] = [];
    let actions: AgentAction[] | null = null;

    const enqueue = (sentence: string) => {
      const refs = pendingPoints.splice(0);
      turn.spoke = true;
      turn.speaker!.enqueue(sentence, () => {
        this.widget.setStatus("speaking", "");
        refs.forEach((ref) => this.pointAt(ref));
      });
    };
    const handle = (parts: ReturnType<MarkerParser["push"]>) => {
      for (const part of parts) {
        if (part.type === "point") {
          // Spoken: point as the sentence that mentions it starts playing. Typed: point right away.
          if (turn.speaker) pendingPoints.push(part.ref);
          else this.pointAt(part.ref);
          continue;
        }
        bubble.append(part.text);
        if (turn.speaker) for (const sentence of splitter.push(part.text)) enqueue(sentence);
      }
    };

    for await (const event of stream) {
      if (event.type === "meta") {
        this.session.conversationId = event.conversationId;
        turn.runId = event.runId;
      } else if (event.type === "text") {
        if (!turn.spoke) this.widget.setStatus("thinking", "");
        handle(parser.push(event.delta));
      } else if (event.type === "actions") {
        turn.runId = event.runId;
        actions = event.actions;
      } else if (event.type === "error") {
        bubble.setText(event.message);
      }
    }
    handle(parser.end());
    if (turn.speaker) {
      for (const sentence of splitter.end()) enqueue(sentence);
      pendingPoints.splice(0).forEach((ref) => this.pointAt(ref));
    }
    const text = stripMarkers(bubble.text).trim();
    if (text) this.remember("assistant", text);
    else bubble.remove();
    return actions;
  }

  /** Carries out actions in order, asking first where needed. Stops at the first one that doesn't succeed. */
  private async runActions(turn: Turn, actions: AgentAction[], startAt = 0, prior: ActionResult[] = []): Promise<ActionResult[]> {
    const steps = this.widget.addSteps();
    const rows = actions.map((a) => steps.add(a.input.description));
    const results = [...prior];
    prior.forEach((r, i) => rows[i]?.setStatus(r.status));
    const signal = turn.controller.signal;
    const ctx = {
      refs: this.snapshot?.refs ?? new Map<string, Element>(),
      pointer: this.widget.pointer,
      config: this.config,
      signal,
      appActions: this.appActions,
    };

    for (let i = startAt; i < actions.length; i++) {
      const action = actions[i]!;
      const row = rows[i]!;
      const pending: PendingRun = {
        runId: turn.runId!,
        conversationId: this.session.conversationId,
        inputMode: turn.inputMode,
        actions,
        index: i,
        results: [...results],
        at: Date.now(),
      };
      if (signal.aborted) {
        results.push({ id: action.id, status: "skipped", output: "Stopped by the user." });
        row.setStatus("skipped");
        continue;
      }
      const blocked = blockedReason(action, this.config);
      if (blocked) {
        row.setStatus("blocked", t("blockedHere"));
        results.push({ id: action.id, status: "blocked", output: blocked });
        this.skipRest(actions, rows, results, i + 1, "Not run because an earlier step was blocked.");
        break;
      }
      if (needsConfirmation(action, ctx, RISKY_ACTION_RE)) {
        row.setStatus("waiting", t("needsOk"));
        const target = action.input.ref ? ctx.refs.get(action.input.ref) : undefined;
        if (target?.isConnected) this.widget.pointer.pointAt(target, 120_000);
        const question = t("confirm", { action: `${action.input.description.charAt(0).toLowerCase()}${action.input.description.slice(1)}` });
        this.widget.setStatus("idle", "");
        if (turn.speaker) {
          turn.spoke = true;
          turn.speaker.enqueue(question);
        }
        const allowed = await this.askToConfirm(question, signal);
        if (!allowed) {
          row.setStatus("declined");
          results.push({ id: action.id, status: "declined", output: "The user said no to this step." });
          this.skipRest(actions, rows, results, i + 1, "Not run because the user declined an earlier step.");
          break;
        }
      }
      const teach = action.name === "wait_for_user";
      row.setStatus(teach ? "waiting" : "running", teach ? action.input.instruction : undefined);
      this.widget.setStatus("thinking", teach ? `Your turn: ${action.input.instruction}` : `${action.input.description}…`);
      if (teach && turn.speaker && action.input.instruction) {
        turn.spoke = true;
        turn.speaker.enqueue(action.input.instruction);
      }
      // If this step reloads the page, the next page load picks the run up from here.
      savePendingRun(pending);
      const result = await executeAction(action, ctx);
      clearPendingRun();
      row.setStatus(result.status, result.status === "done" ? undefined : result.output);
      results.push(result);
      if (result.status !== "done") {
        this.skipRest(actions, rows, results, i + 1, "Not run because the previous step didn't work.");
        break;
      }
    }
    return results;
  }

  private skipRest(actions: AgentAction[], rows: { setStatus(s: "skipped"): void }[], results: ActionResult[], from: number, why: string) {
    for (let j = from; j < actions.length; j++) {
      results.push({ id: actions[j]!.id, status: "skipped", output: why });
      rows[j]?.setStatus("skipped");
    }
  }

  private askToConfirm(question: string, signal: AbortSignal): Promise<boolean> {
    const { result, answer } = this.widget.confirm(question);
    this.confirmByVoice = answer;
    signal.addEventListener("abort", () => answer(false), { once: true });
    return result.finally(() => {
      if (this.confirmByVoice === answer) this.confirmByVoice = null;
    });
  }

  /** Picks up a run that navigated to a new page mid-step. */
  private async resume(pending: PendingRun) {
    await settle(300, 2500);
    const turn = this.beginTurn(pending.inputMode);
    turn.runId = pending.runId;
    const current = pending.actions[pending.index]!;
    const results: ActionResult[] = [
      ...pending.results,
      {
        id: current.id,
        status: "done",
        output: `${current.name === "wait_for_user" ? "The user did it." : `${current.input.description}: done.`} The page is now ${location.pathname}.`,
      },
    ];
    for (const a of pending.actions.slice(pending.index + 1)) {
      results.push({ id: a.id, status: "skipped", output: "Not run because the page changed." });
    }
    const steps = this.widget.addSteps();
    pending.actions.forEach((a, i) => steps.add(a.input.description).setStatus(results[i]?.status ?? "skipped"));
    this.snapshot = takeSnapshot(this.config.masking);
    this.widget.setRunning(() => this.stop());
    await this.drive(
      turn,
      postEventStream(
        `${this.apiUrl}/api/v1/chat/continue`,
        { ...this.caller(), runId: pending.runId, results, page: this.page() },
        turn.controller.signal,
      ),
    );
  }

  private async cancelRun(runId: string, results: ActionResult[]) {
    try {
      const stream = postEventStream(
        `${this.apiUrl}/api/v1/chat/continue`,
        { ...this.caller(), runId, results, cancel: true, page: this.page() },
        new AbortController().signal,
      );
      for await (const _ of stream) {
        // drain
      }
    } catch {
      // best effort
    }
  }

  private page() {
    return {
      url: location.href,
      title: document.title.slice(0, 300),
      snapshot: this.snapshot?.text ?? "",
      appActions: this.appActions.list(),
    };
  }

  private pointAt(ref: string) {
    const target = this.snapshot?.refs.get(ref);
    if (target?.isConnected) this.widget.pointer.pointAt(target);
  }

  private async startListening() {
    if (this.listening) return;
    // While a step waits for approval, talking answers it instead of interrupting.
    if (!this.confirmByVoice) this.stop();
    else this.speaker?.stop();
    this.widget.open();
    if (!this.listener) {
      this.widget.setStatus("idle", t("voiceUnavailable"));
      return;
    }
    this.widget.setStatus("listening");
    const listener = this.listener;
    this.listening = listener
      .start((partial) => this.widget.setStatus("listening", partial || t("listening")))
      .catch((error: unknown) => {
        const denied = error instanceof DOMException && error.name === "NotAllowedError";
        this.widget.setStatus(
          "idle",
          denied ? t("micBlocked") : t("micFailed"),
        );
        this.listening = null;
        throw error;
      });
  }

  private async stopListening() {
    const started = this.listening;
    if (!started || !this.listener) return;
    try {
      await started;
    } catch {
      return;
    }
    const text = await this.listener.stop();
    this.listening = null;
    if (this.confirmByVoice && text) {
      if (YES_RE.test(text) && !NO_RE.test(text)) return this.confirmByVoice(true);
      if (NO_RE.test(text)) return this.confirmByVoice(false);
    }
    if (text) void this.ask(text, "voice");
    else this.widget.setStatus("idle", t("didntCatch"));
  }

  private setMuted(muted: boolean) {
    this.session.muted = muted;
    this.widget.setMuted(muted);
    if (muted) this.speaker?.stop();
    this.save();
  }

  /** Hold Alt+Space (⌥ Space on Mac) anywhere on the page to talk. */
  private bindHotkey() {
    if (!this.listener) return;
    let held = false;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      if (e.repeat || held) return;
      held = true;
      void this.startListening();
    };
    const up = (e: KeyboardEvent) => {
      if (!held || (e.code !== "Space" && e.key !== "Alt")) return;
      held = false;
      void this.stopListening();
    };
    const blur = () => {
      if (!held) return;
      held = false;
      void this.stopListening();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    this.teardown.push(() => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
    });
  }

  private remember(role: "user" | "assistant", text: string) {
    this.session.messages.push({ role, text });
    this.save();
  }

  private save() {
    saveSession(this.session);
  }

  private voiceToken() {
    return postJson<VoiceTokenResponse>(`${this.apiUrl}/api/v1/voice/token`, this.caller());
  }

  private async speechAudio(text: string, signal: AbortSignal) {
    const res = await fetch(`${this.apiUrl}/api/v1/voice/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...this.caller(), text }),
      signal,
    });
    if (!res.ok) throw new ApiError(`http_${res.status}`, res.status);
    return res.blob();
  }
}

export { getAnonymousId };
export type { MessageHandle };
