import { ChangeDetectionStrategy, Component, OnInit, signal, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { GlobalEventsManager } from '../../common/eventmanager';

@Component({
    selector: 'app-footer',
    templateUrl: './footer.component.html',
    styleUrls: ['./footer.component.scss'],
    standalone: true,
    imports: [],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FooterComponent implements OnInit {
  private globalEventsManager = inject(GlobalEventsManager);


  public showFooter = signal(false);  

  // expose apiVersion() for the template (template calls `apiVersion()`)
  public apiVersion = environment.apiVersion;

  constructor() {
  }

  ngOnInit() {
    this.globalEventsManager.showFooter.subscribe((showFooter: boolean) => {
      this.showFooter.set(showFooter);
    });
  }
}
