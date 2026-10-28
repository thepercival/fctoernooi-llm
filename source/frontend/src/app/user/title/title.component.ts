import { ChangeDetectionStrategy, Component, input, inject } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition, IconName } from '@fortawesome/fontawesome-svg-core';
import { MyNavigation } from '../../shared/common/navigation';

@Component({
    selector: 'app-user-title',
    templateUrl: './title.component.html',
    standalone: true,
    imports: [FontAwesomeModule],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserTitleComponent {
  private myNavigation = inject(MyNavigation);

  readonly title = input('');
  readonly icon = input.required<IconDefinition>();
  constructor() {
  }

  navigateBack() {
    this.myNavigation.back();
  }
}

