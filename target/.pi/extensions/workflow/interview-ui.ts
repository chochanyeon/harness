import { Box, Text, truncateToWidth, matchesKey, Key } from "@earendil-works/pi-tui";

export type InterviewQuestion = {
  id: string;
  title: string;
  prompt: string;
  helpText: string;
  required: boolean;
  choices: Array<{ id: string; label: string }>;
  allowFreeText: boolean;
  allowSkip: boolean;
};

export type InterviewAnswer = {
  questionId: string;
  selectedChoiceIds: string[];
  freeText: string;
  skipped: boolean;
};

export type InterviewWizardResult = {
  completed: boolean;
  summaryMarkdown: string;
  answers: InterviewAnswer[];
};

export const DEFAULT_INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: "scope",
    title: "무엇을 만들거나 수정하나요?",
    prompt: "이번 작업의 구체적 범위를 답해주세요.",
    helpText: "예: 질문 표시 방식, 답변 입력 UX, 진행 상태, 미리보기 등",
    required: true,
    allowFreeText: true,
    allowSkip: false,
    choices: [
      { id: "question-display", label: "질문 표시 방식" },
      { id: "answer-input", label: "답변 입력 UX" },
      { id: "progress", label: "진행 상태 표시" },
      { id: "preview", label: "답변 요약 미리보기" },
    ],
  },
  {
    id: "motivation",
    title: "왜 필요한가요?",
    prompt: "현재 불편함 또는 해결하려는 문제를 답해주세요.",
    helpText: "사용자가 헷갈리거나 반복 입력해야 하는 지점을 적어주세요.",
    required: true,
    allowFreeText: true,
    allowSkip: false,
    choices: [
      { id: "numbering", label: "번호를 맞춰 답변하는 방식이 불편함" },
      { id: "unclear-progress", label: "진행 상태가 한눈에 보이지 않음" },
      { id: "missing-preview", label: "지금까지 답변 요약을 보기 어려움" },
      { id: "hard-to-answer", label: "무엇을 답해야 할지 막막함" },
    ],
  },
  {
    id: "acceptance",
    title: "완료 기준은 무엇인가요?",
    prompt: "구현 후 pass/fail로 판단할 수 있는 기준을 답해주세요.",
    helpText: "테스트 가능한 기준을 선택하고 필요한 내용을 추가하세요.",
    required: true,
    allowFreeText: true,
    allowSkip: false,
    choices: [
      { id: "no-manual-numbering", label: "번호를 직접 입력하지 않아도 됨" },
      { id: "auto-wizard", label: "interview 시작 시 wizard 자동 표시" },
      { id: "choice-and-free-text", label: "선택지와 자유입력을 함께 지원" },
      { id: "summary-preview", label: "답변 요약 preview 제공" },
    ],
  },
  {
    id: "affected-files",
    title: "영향 받는 파일/모듈을 알고 있나요?",
    prompt: "알고 있는 파일이나 모듈을 선택하거나 입력하세요.",
    helpText: "모르면 Skip을 사용할 수 있습니다.",
    required: false,
    allowFreeText: true,
    allowSkip: true,
    choices: [
      { id: "workflow-ts", label: "target/.pi/extensions/workflow.ts" },
      { id: "workflow-ui", label: "target/.pi/extensions/workflow/ui.ts" },
      { id: "new-interview-ui", label: "새 interview UI 모듈" },
      { id: "readme", label: "README.md / README.en.md" },
    ],
  },
  {
    id: "constraints-risks",
    title: "제약사항이나 알려진 위험이 있나요?",
    prompt: "반드시 지켜야 할 제약이나 우려되는 위험을 답해주세요.",
    helpText: "없으면 Skip을 사용할 수 있습니다.",
    required: false,
    allowFreeText: true,
    allowSkip: true,
    choices: [
      { id: "preserve-phases", label: "기존 workflow phase/gate 유지" },
      { id: "non-ui-fallback", label: "비 UI 모드 fallback 필요" },
      { id: "korean-ime", label: "한국어 입력/IME 안정성" },
      { id: "no-external-deps", label: "외부 의존성 추가 없음" },
    ],
  },
];

type WizardDone = (value: InterviewWizardResult | null) => void;

type WizardContext = {
  hasUI: boolean;
  ui: {
    custom: <T>(factory: (tui: any, theme: any, keybindings: any, done: (value: T) => void) => any, options?: Record<string, unknown>) => Promise<T>;
    setWidget?: (key: string, value: unknown, options?: Record<string, unknown>) => void;
    notify?: (message: string, level?: string) => void;
  };
};

export async function launchInterviewWizard(ctx: WizardContext, workflowTitle: string): Promise<InterviewWizardResult | null> {
  if (!ctx.hasUI || typeof ctx.ui.custom !== "function") return null;

  const answers = DEFAULT_INTERVIEW_QUESTIONS.map((question) => ({
    questionId: question.id,
    selectedChoiceIds: [] as string[],
    freeText: "",
    skipped: false,
  }));
  let currentIndex = 0;

  if (typeof ctx.ui.setWidget === "function") {
    ctx.ui.setWidget("interview-progress", (_tui: unknown, theme: any) => renderProgressWidget(theme, currentIndex, answers));
  }

  try {
    return await ctx.ui.custom<InterviewWizardResult | null>((tui, theme, _keybindings, done) => {
      return new InterviewWizard(tui, theme, workflowTitle, answers, (nextIndex) => {
        currentIndex = nextIndex;
        tui.requestRender?.();
      }, done);
    });
  } finally {
    try { ctx.ui.setWidget?.("interview-progress", undefined); } catch { /* non-fatal */ }
  }
}

function renderProgressWidget(theme: any, currentIndex: number, answers: InterviewAnswer[]): Box {
  const lines = ["Interview Progress"];
  DEFAULT_INTERVIEW_QUESTIONS.forEach((question, index) => {
    const answer = answers[index];
    const done = answer.skipped || answer.selectedChoiceIds.length > 0 || answer.freeText.trim().length > 0;
    const marker = index === currentIndex ? ">" : done ? "✓" : "○";
    lines.push(`${marker} ${index + 1}. ${question.title}`);
  });
  const box = new Box(1, 0, theme ? (s: string) => theme.bg("customMessageBg", s) : undefined);
  box.addChild(new Text(lines.map((line, index) => index === 0 && theme ? theme.fg("accent", line) : line).join("\n"), 0, 0));
  return box;
}

class InterviewWizard {
  private index = 0;
  private choiceCursor = 0;
  private focus: "choices" | "text" = "choices";
  private error = "";
  private preview = false;
  private finalPreview = false;

  constructor(
    private readonly tui: any,
    private readonly theme: any,
    private readonly workflowTitle: string,
    private readonly answers: InterviewAnswer[],
    private readonly onStateChange: (index: number) => void,
    private readonly done: WizardDone,
  ) {}

  invalidate(): void {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.escape) && !this.preview) {
      this.done(null);
      return;
    }

    if (this.preview) {
      if (matchesKey(data, Key.enter) && this.finalPreview) {
        this.done({ completed: true, summaryMarkdown: buildAnswerSummary(this.answers), answers: cloneAnswers(this.answers) });
        return;
      }
      if (matchesKey(data, Key.escape) || data.toLowerCase() === "v") {
        this.preview = false;
        this.finalPreview = false;
        this.requestRender();
      }
      return;
    }

    if (matchesKey(data, Key.tab)) {
      this.focus = this.focus === "choices" ? "text" : "choices";
      this.requestRender();
      return;
    }

    if (this.focus === "choices") {
      if (data.toLowerCase() === "v") {
        this.preview = true;
        this.requestRender();
        return;
      }
      if (data.toLowerCase() === "p") {
        this.movePrevious();
        return;
      }
      if (data.toLowerCase() === "n" || matchesKey(data, Key.enter)) {
        this.moveNext();
        return;
      }
      if (data.toLowerCase() === "s") {
        this.skipCurrent();
        return;
      }
      if (matchesKey(data, Key.up)) {
        this.choiceCursor = Math.max(0, this.choiceCursor - 1);
        this.requestRender();
        return;
      }
      if (matchesKey(data, Key.down)) {
        const choices = this.currentQuestion().choices;
        this.choiceCursor = Math.min(Math.max(0, choices.length - 1), this.choiceCursor + 1);
        this.requestRender();
        return;
      }
      if (matchesKey(data, Key.space)) {
        this.toggleChoice();
        return;
      }
    }

    if (matchesKey(data, Key.enter)) {
      this.moveNext();
      return;
    }
    if (matchesKey(data, Key.backspace) || data === "") {
      const answer = this.currentAnswer();
      answer.freeText = Array.from(answer.freeText).slice(0, -1).join("");
      answer.skipped = false;
      this.error = "";
      this.requestRender();
      return;
    }
    if (isPrintable(data)) {
      const answer = this.currentAnswer();
      answer.freeText += data;
      answer.skipped = false;
      this.error = "";
      this.requestRender();
    }
  }

  render(width: number): string[] {
    return this.preview ? this.renderPreview(width) : this.renderQuestion(width);
  }

  private renderQuestion(width: number): string[] {
    const question = this.currentQuestion();
    const answer = this.currentAnswer();
    const lines = [
      this.color("accent", `Interview Wizard: ${this.workflowTitle}`),
      this.color("dim", `Question ${this.index + 1}/${DEFAULT_INTERVIEW_QUESTIONS.length}`),
      "",
      this.color("accent", question.title),
      question.prompt,
      this.color("dim", question.helpText),
      "",
      "선택지 (↑↓ 이동, Space 선택):",
    ];

    question.choices.forEach((choice, index) => {
      const cursor = index === this.choiceCursor ? ">" : " ";
      const checked = answer.selectedChoiceIds.includes(choice.id) ? "[x]" : "[ ]";
      lines.push(`${cursor} ${checked} ${choice.label}`);
    });

    lines.push("", `${this.focus === "text" ? ">" : " "} 자유입력 (Tab으로 선택지/입력 전환):`, answer.freeText.length > 0 ? `${answer.freeText}█` : this.color("dim", "내용을 입력하세요…"));
    if (this.error) lines.push("", this.color("error", this.error));
    lines.push("", this.color("dim", "choices focus: Enter/n 다음 • p 이전 • v 미리보기 • s 건너뛰기 • Space 선택"));
    lines.push(this.color("dim", "text focus: 일반 문자/공백 입력 • Backspace 삭제 • Enter 다음 • Tab 전환 • Esc 취소"));
    return lines.map((line) => truncateToWidth(line, width));
  }

  private renderPreview(width: number): string[] {
    const lines = [this.color("accent", "Interview Answer Preview"), "", ...buildAnswerSummary(this.answers).split("\n")];
    lines.push("", this.color("dim", this.finalPreview ? "Enter 완료 • Esc 돌아가기" : "Esc/v 돌아가기"));
    return lines.map((line) => truncateToWidth(line, width));
  }

  private movePrevious(): void {
    this.index = Math.max(0, this.index - 1);
    this.choiceCursor = 0;
    this.error = "";
    this.onStateChange(this.index);
    this.requestRender();
  }

  private moveNext(): void {
    if (!this.isCurrentValid()) {
      this.error = "필수 질문입니다. 선택지를 고르거나 자유입력을 작성해주세요.";
      this.requestRender();
      return;
    }
    if (this.index === DEFAULT_INTERVIEW_QUESTIONS.length - 1) {
      this.preview = true;
      this.finalPreview = true;
      this.requestRender();
      return;
    }
    this.index += 1;
    this.choiceCursor = 0;
    this.error = "";
    this.onStateChange(this.index);
    this.requestRender();
  }

  private skipCurrent(): void {
    const question = this.currentQuestion();
    if (!question.allowSkip) {
      this.error = "이 질문은 필수라서 건너뛸 수 없습니다.";
      this.requestRender();
      return;
    }
    const answer = this.currentAnswer();
    answer.skipped = true;
    answer.selectedChoiceIds = [];
    answer.freeText = "";
    this.focus = "choices";
    this.moveNext();
  }

  private toggleChoice(): void {
    const question = this.currentQuestion();
    const choice = question.choices[this.choiceCursor];
    if (!choice) return;
    const answer = this.currentAnswer();
    answer.skipped = false;
    if (answer.selectedChoiceIds.includes(choice.id)) {
      answer.selectedChoiceIds = answer.selectedChoiceIds.filter((id) => id !== choice.id);
    } else {
      answer.selectedChoiceIds.push(choice.id);
    }
    this.error = "";
    this.requestRender();
  }

  private isCurrentValid(): boolean {
    const question = this.currentQuestion();
    const answer = this.currentAnswer();
    if (!question.required) return true;
    return answer.selectedChoiceIds.length > 0 || answer.freeText.trim().length > 0;
  }

  private currentQuestion(): InterviewQuestion {
    return DEFAULT_INTERVIEW_QUESTIONS[this.index];
  }

  private currentAnswer(): InterviewAnswer {
    return this.answers[this.index];
  }

  private color(kind: "accent" | "dim" | "error", text: string): string {
    return this.theme?.fg(kind, text) ?? text;
  }

  private requestRender(): void {
    this.onStateChange(this.index);
    this.tui.requestRender?.();
  }
}

function buildAnswerSummary(answers: InterviewAnswer[]): string {
  return DEFAULT_INTERVIEW_QUESTIONS.map((question, index) => {
    const answer = answers[index];
    const labels = question.choices.filter((choice) => answer.selectedChoiceIds.includes(choice.id)).map((choice) => choice.label);
    const values = [];
    if (answer.skipped) values.push("건너뜀/모름");
    if (labels.length > 0) values.push(`선택: ${labels.join(", ")}`);
    if (answer.freeText.trim().length > 0) values.push(`입력: ${answer.freeText.trim()}`);
    return `- ${question.title}: ${values.length > 0 ? values.join(" / ") : "미입력"}`;
  }).join("\n");
}

function cloneAnswers(answers: InterviewAnswer[]): InterviewAnswer[] {
  return answers.map((answer) => ({ ...answer, selectedChoiceIds: [...answer.selectedChoiceIds] }));
}

function isPrintable(data: string): boolean {
  if (!data || data.includes("\x1b") || data === "\r" || data === "\n") return false;
  return Array.from(data).every((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code >= 32 && code !== 127;
  });
}
