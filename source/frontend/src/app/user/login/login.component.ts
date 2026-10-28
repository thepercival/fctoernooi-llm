import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NgbAlert } from '@ng-bootstrap/ng-bootstrap';

import { AuthService } from '../../lib/auth/auth.service';
import { IAlert, IAlertType } from '../../shared/common/alert';
import { User } from '../../lib/user';
import { UserComponent } from '../component';
import { UserRepository } from '../../lib/user/repository';
import { GlobalEventsManager } from '../../shared/common/eventmanager';
import { UserTitleComponent } from '../title/title.component';
import { faSignInAlt, faSpinner } from '@fortawesome/free-solid-svg-icons';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.css'],
    standalone: true,
    imports: [FontAwesomeModule, NgbAlert, ReactiveFormsModule, RouterModule, UserTitleComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent extends UserComponent implements OnInit {
  registered = false;
  public typedForm: FormGroup<{
    emailaddress: FormControl<string>,
    password: FormControl<string>
  }>;

  faSignInAlt = faSignInAlt;
  faSpinner = faSpinner;

  validations: any = {
    minlengthemailaddress: User.MIN_LENGTH_EMAIL,
    maxlengthemailaddress: User.MAX_LENGTH_EMAIL,
    minlengthpassword: User.MIN_LENGTH_PASSWORD,
    maxlengthpassword: User.MAX_LENGTH_PASSWORD
  };
  constructor() {
    const route = inject(ActivatedRoute);
    const router = inject(Router);
    const userRepository = inject(UserRepository);
    const authService = inject(AuthService);
    const globalEventsManager = inject(GlobalEventsManager);

    super(route, router, userRepository, authService, globalEventsManager);
    this.typedForm = new FormGroup({
      emailaddress: new FormControl('', { nonNullable: true, validators: 
        [
            Validators.required,
            Validators.minLength(this.validations.minlengthemailaddress),
            Validators.maxLength(this.validations.maxlengthemailaddress)
        ] 
      }),
      password: new FormControl('', { nonNullable: true, validators: 
        [
            Validators.required,
            Validators.minLength(this.validations.minlengthpassword),
            Validators.maxLength(this.validations.maxlengthpassword)
        ] 
      }),
    });
  }

  ngOnInit() {
    this.route.queryParams.subscribe(
      (param: any) => {
        if (param.message !== undefined) {
          this.setAlert(IAlertType.Info, param.message);
        }
      });
    if (this.authService.isLoggedIn() === true) {
      this.setAlert(IAlertType.Danger, 'je bent al ingelogd');
    }
    this.processing.set(false);
  }

  login(): boolean {
    this.processing.set(true);
    this.setAlert(IAlertType.Info, 'je wordt ingelogd');

    const emailaddress = this.typedForm.controls.emailaddress.value;
    const password = this.typedForm.controls.password.value;

    this.authService.login(emailaddress, password)
      .subscribe({
        next: () => {
          this.router.navigate(['/']);
        },
        error: (e: string) => {
          this.setAlert(IAlertType.Danger, e); this.processing.set(false);
        },
        complete: () => this.processing.set(false)
      });
    return false;
  }
}
