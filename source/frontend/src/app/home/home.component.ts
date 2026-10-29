import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { IAlert } from '../shared/common/alert';
import { faEye, faGlobe, faPlus, faTrophy } from '@fortawesome/free-solid-svg-icons';
import { ChatAssistantComponent, ChatSuggestion } from '../shared/chat/chat-assistant.component';

const comingSoon = 'Dit onderdeel is nog in aanbouw en komt binnenkort beschikbaar.';

// Placeholder until the tournament module (shells, "my tournaments") is built.
@Component({
    selector: 'app-home',
    imports: [ChatAssistantComponent],
    templateUrl: './home.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit {
  private route = inject(ActivatedRoute);
  readonly alert = signal<IAlert | undefined>(undefined);

  readonly suggestions: ChatSuggestion[] = [
    { id: 'create', icon: faPlus, question: 'Toernooi aanmaken', answer: comingSoon },
    { id: 'mine', icon: faTrophy, question: 'Mijn toernooien', answer: comingSoon },
    { id: 'public', icon: faGlobe, question: 'Publieke toernooien', answer: comingSoon },
    { id: 'examples', icon: faEye, question: 'Voorbeeldtoernooien', answer: comingSoon },
  ];

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['type'] !== undefined && params['message'] !== undefined) {
        this.alert.set({ type: params['type'], message: params['message'] });
      }
    });
  }
}
