import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NavComponent } from "./shared/layout/nav/nav.component";
import { FooterComponent } from "./shared/layout/footer/footer.component";
import { SvgIconComponent } from "./shared/layout/svgicon.component";
import { RouterOutlet } from "@angular/router";

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css'],
    standalone: true,
    imports: [NavComponent, FooterComponent, RouterOutlet],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  constructor(
  ) {
    /*const preloadElement = document.createElement('link');
    preloadElement.rel = 'preload';
    preloadElement.as = 'style';
    preloadElement.href = 'styles.css';
    document.body.appendChild(preloadElement);

    const lazyStyleElement = document.createElement('link');
    lazyStyleElement.rel = 'stylesheet';
    lazyStyleElement.href = 'styles.css';
    document.body.appendChild(lazyStyleElement);*/
  }
}
