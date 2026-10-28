import { AfterContentInit, ChangeDetectionStrategy, Component, ElementRef, OnInit, effect, input, signal, inject } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';

import { AuthService } from '../../../lib/auth/auth.service';
import { GlobalEventsManager } from '../../../shared/common/eventmanager';
import { LiveboardLink } from '../../../lib/liveboard/link';
import { DefaultJsonTheme, JsonTheme } from '../../../lib/tournament/theme';
import { SvgIconComponent } from '../svgicon.component';
import { environment } from '../../../../environments/environment';

@Component({
    selector: 'app-nav',
    templateUrl: './nav.component.html',
    styleUrls: ['./nav.component.scss'],
    standalone: true,
    imports: [RouterModule, SvgIconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavComponent implements OnInit, AfterContentInit {
  private elRef = inject(ElementRef);
  private router = inject(Router);
  authService = inject(AuthService);
  private globalEventsManager = inject(GlobalEventsManager);


  public defaultTitle: string = 'FCToernooi';
  private colorMode: ColorMode;
  public navBarData = signal<NavBarData>({
    title: this.defaultTitle,
    theme: DefaultJsonTheme,
    atHome: true
  });  
  tournamentLiveboardLink: LiveboardLink = {};
  navbarCollapsed = true;
  private readonly isAccEnvironment = environment.apiurl.includes('acc-api.fctoernooi.nl');
  constructor() {
    let colorMode = <ColorMode>localStorage.getItem('colorMode');
    if (colorMode === null) {
      colorMode = ColorMode.Inherit;
    }
    this.colorMode = colorMode;    
    this.setAndApplyColorMode(colorMode);
    // without an explicit choice the system colour scheme is followed, also when it changes while the page is open
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.colorMode === ColorMode.Inherit) {
        this.setAndApplyColorMode(ColorMode.Inherit);
      }
    });

    effect(() => {
      // this.navBarData.set(this.navBarDataInput());
      this.updateCustomProperty();
    });
  }

  ngOnInit() {
    this.updateIsAtHome();
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.updateIsAtHome();
      });

    this.globalEventsManager.updateDataInNavBar.subscribe((navBarData: NavBarData) => {
      this.navBarData.set(navBarData);
      this.updateCustomProperty();
    });
    this.updateCustomProperty();
  }

  ngAfterContentInit() {
    // update this here, or later in the component
    this.updateCustomProperty();
  }

  updateCustomProperty() {
    const theme = this.navBarData().theme;
    if (theme !== undefined) {
      // console.log('--nav-bg', theme.bgColor);
      // console.log('--nav-color', theme.textColor)
      const navBg = this.isAccEnvironment ? '#ff69b4' : theme.bgColor;
      const navColor = this.isAccEnvironment ? '#111111' : theme.textColor;
      this.elRef.nativeElement.style.setProperty('--nav-bg', navBg);
      this.elRef.nativeElement.style.setProperty('--nav-color', navColor);
    }
  }

  execLeftButton() {
    if (!this.navBarData().atHome) {
      this.linkToHome();
    } else {
      let colorMode = this.effectiveColorMode() === ColorMode.Dark ? ColorMode.Light : ColorMode.Dark;
      this.setAndApplyColorMode(colorMode);
    }
  }

  private updateIsAtHome() {
    this.navBarData.update((navBarData: NavBarData): NavBarData => ({
      ...navBarData,
      atHome: this.router.url === '/'
    }));
  }

  linkToHome(){
    this.globalEventsManager.updateDataInNavBar.emit({
      title: this.defaultTitle,
      atHome: true,
      theme: DefaultJsonTheme
    });
    this.router.navigate(['/']);
  }

  linkToUserProfile() {
    this.globalEventsManager.updateDataInNavBar.emit({
      title: this.defaultTitle,
      atHome: false,
      theme: DefaultJsonTheme
    });
    this.router.navigate(['/user/profile']);
  }

  linkToLogin() {
    this.globalEventsManager.updateDataInNavBar.emit({
      title: this.defaultTitle,
      atHome: false,
      theme: DefaultJsonTheme
    });
    this.router.navigate(['/user/login']);
  }

  private effectiveColorMode(): ColorMode {
    if (this.colorMode !== ColorMode.Inherit) {
      return this.colorMode;
    }
    return matchMedia('(prefers-color-scheme: dark)').matches ? ColorMode.Dark : ColorMode.Light;
  }

  setAndApplyColorMode(colorMode: ColorMode) {
    this.colorMode = colorMode;    
    localStorage.setItem('colorMode', colorMode);
    if (this.colorMode === ColorMode.Inherit) {
      document.body.setAttribute('data-bs-theme', this.effectiveColorMode());
      return;
    }
    document.body.setAttribute('data-bs-theme', this.colorMode);
  }
}

export interface NavBarData {
  title: string;
  atHome: boolean;
  theme: JsonTheme;
}

export enum ColorMode {
  Inherit = 'inherit', Light = 'light', Dark = 'dark'
}