import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../lib/auth/auth.service';
import { IAlert } from '../shared/common/alert';
import { GlobalEventsManager } from '../shared/common/eventmanager';

// Placeholder until the tournament module (shells, "my tournaments") is built.
@Component({
    selector: 'app-home',
    imports: [RouterLink],
    templateUrl: './home.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit {
  private route = inject(ActivatedRoute);
  authService = inject(AuthService);

  readonly alert = signal<IAlert | undefined>(undefined);

  constructor() {
    inject(GlobalEventsManager).showFooter.emit(true);
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['type'] !== undefined && params['message'] !== undefined) {
        this.alert.set({ type: params['type'], message: params['message'] });
      }
    });
  }
}
