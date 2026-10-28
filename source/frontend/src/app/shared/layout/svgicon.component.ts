import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
    selector: 'app-svg-icon',
    templateUrl: 'svgicon.component.html',
    styleUrls: ['./svgicon.component.scss'],
    standalone: true,
    imports: [],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SvgIconComponent {
  readonly icon = input.required<string>();
  readonly width = input<number | undefined>(40);
  readonly height = input<number | undefined>(40);
  readonly size = input<number | undefined>(24);
  readonly fill = input<string | undefined>(undefined);
  readonly className = input<string | undefined>(undefined, { alias: 'class' });
}