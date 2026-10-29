import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, effect, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faComments, faMicrophone, faPaperPlane, faStop, faXmark } from '@fortawesome/free-solid-svg-icons';

export interface ChatSuggestion {
  id: string;
  icon: IconDefinition;
  question: string;
  answer: string;
}

interface ChatMessage {
  author: 'user' | 'assistant';
  text: string;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

// Floating chat assistant (bottom right) with suggested questions, a text line and a microphone.
// Drop <app-chat-assistant [suggestions]="..." /> into any page.
@Component({
    selector: 'app-chat-assistant',
    templateUrl: './chat-assistant.component.html',
    styleUrls: ['./chat-assistant.component.scss'],
    standalone: true,
    imports: [FaIconComponent, NgTemplateOutlet],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatAssistantComponent {
  readonly suggestions = input.required<ChatSuggestion[]>();
  readonly title = input<string>('Assistent');
  readonly followUp = input<string>('Kan ik je nog ergens mee helpen?');
  readonly fallbackAnswer = input<string>('Dat kan ik nog niet beantwoorden. Kies gerust een van de vragen hierboven.');
  readonly speechLang = input<string>('nl-NL');
  readonly initiallyOpen = input<boolean>(false);
  // 'docked': full-width bar stuck to the bottom of the page with the conversation in the page itself (home).
  // 'floating': round button with a popup panel, bottom right.
  readonly variant = input<'floating' | 'docked'>('floating');

  readonly questionAsked = output<ChatSuggestion>();
  readonly messageSent = output<string>();

  protected readonly open = linkedSignal(() => this.initiallyOpen());
  protected readonly messages = signal<ChatMessage[]>([]);
  protected readonly typing = signal(false);
  protected readonly listening = signal(false);
  protected readonly speechSupported = !!ChatAssistantComponent.speechCtor();

  private readonly answerDelayMs = 700;

  protected readonly faComments = faComments;
  protected readonly faXmark = faXmark;
  protected readonly faPaperPlane = faPaperPlane;
  protected readonly faMicrophone = faMicrophone;
  protected readonly faStop = faStop;

  private readonly log = viewChild<ElementRef<HTMLElement>>('log');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private recognition?: SpeechRecognitionLike;

  constructor() {
    effect(() => {
      this.messages();
      this.typing();
      const log = this.log()?.nativeElement;
      if (log) {
        queueMicrotask(() => log.scrollTop = log.scrollHeight);
      } else if (this.variant() === 'docked' && this.messages().length > 0) {
        queueMicrotask(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }));
      }
    });
  }

  private static speechCtor(): SpeechRecognitionCtor | undefined {
    const w = globalThis as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition;
  }

  protected toggle(): void {
    this.open.update(open => !open);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected ask(suggestion: ChatSuggestion): void {
    this.open.set(true);
    this.append(suggestion.question, suggestion.answer);
    this.questionAsked.emit(suggestion);
  }

  protected isAsked(suggestion: ChatSuggestion): boolean {
    return this.messages().some(message => message.author === 'user' && message.text === suggestion.question);
  }

  protected send(): void {
    const field = this.field()?.nativeElement;
    const text = field?.value.trim() ?? '';
    if (!field || text === '') {
      return;
    }
    field.value = '';
    this.submit(text);
  }

  protected toggleListening(): void {
    if (this.listening()) {
      this.recognition?.stop();
      return;
    }
    const Ctor = ChatAssistantComponent.speechCtor();
    if (!Ctor) {
      return;
    }
    const recognition = new Ctor();
    recognition.lang = this.speechLang();
    recognition.interimResults = false;
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript.trim();
      if (transcript) {
        this.submit(transcript);
      }
    };
    recognition.onend = () => this.listening.set(false);
    recognition.onerror = () => this.listening.set(false);
    this.recognition = recognition;
    this.listening.set(true);
    recognition.start();
  }

  private submit(text: string): void {
    this.open.set(true);
    const match = this.suggestions().find(s => s.question.toLowerCase() === text.toLowerCase());
    this.append(text, match?.answer ?? this.fallbackAnswer());
    if (match) {
      this.questionAsked.emit(match);
    } else {
      this.messageSent.emit(text);
    }
  }

  private append(question: string, answer: string): void {
    this.messages.update(messages => [...messages, { author: 'user', text: question }]);
    this.typing.set(true);
    // brief "typing" pause so it feels like the assistant is answering
    setTimeout(() => {
      this.messages.update(messages => [...messages, { author: 'assistant', text: answer }]);
      this.typing.set(false);
    }, this.answerDelayMs);
  }
}
