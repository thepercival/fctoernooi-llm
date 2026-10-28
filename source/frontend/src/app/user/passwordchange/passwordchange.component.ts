import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NgbAlert } from '@ng-bootstrap/ng-bootstrap';

import { AuthService } from '../../lib/auth/auth.service';
import { IAlertType } from '../../shared/common/alert';
import { User } from '../../lib/user';
import { UserRepository } from '../../lib/user/repository';
import { UserComponent } from '../component';
import { GlobalEventsManager } from '../../shared/common/eventmanager';
import { CustomValidators } from '../password-validation';
import { UserTitleComponent } from '../title/title.component';
import { faKey, faSpinner } from '@fortawesome/free-solid-svg-icons';

@Component({
    selector: 'app-passwordchange',
    templateUrl: './passwordchange.component.html',
    styleUrls: ['./passwordchange.component.css'],
  standalone: true,
  imports: [FontAwesomeModule, NgbAlert, ReactiveFormsModule, RouterModule, UserTitleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PasswordchangeComponent extends UserComponent implements OnInit {
  passwordChanged = false;
  faKey = faKey;
  faSpinner = faSpinner;
  public typedForm: FormGroup<{
    code: FormControl<string>,
    password: FormControl<string>,
    passwordRepeat: FormControl<string>,
  }>;

  validations: any = {
    minlengthpassword: User.MIN_LENGTH_PASSWORD,
    maxlengthpassword: User.MAX_LENGTH_PASSWORD
  };
  private emailaddress: string = '';
  constructor() {
    const route = inject(ActivatedRoute);
    const router = inject(Router);
    const userRepository = inject(UserRepository);
    const authService = inject(AuthService);
    const globalEventsManager = inject(GlobalEventsManager);

    super(route, router, userRepository, authService, globalEventsManager);
    this.typedForm = new FormGroup(
      {
        code: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
        password: new FormControl('', { nonNullable: true, validators: 
          [
              Validators.required,
              Validators.minLength(this.validations.minlengthpassword),
              Validators.maxLength(this.validations.maxlengthpassword)
          ] 
        }),      
        passwordRepeat: new FormControl('', { nonNullable: true, validators: 
          [
              Validators.required,
              Validators.minLength(this.validations.minlengthpassword),
              Validators.maxLength(this.validations.maxlengthpassword)
          ] 
        })
      },
      { validators: CustomValidators.passwordsMatching }
    )
  }

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      this.emailaddress = params.get('emailaddress') ?? '';
      // the link in the email carries the one-time code
      this.typedForm.controls.code.setValue(params.get('token') ?? '');
    });
    this.processing.set(false);
  }

  changePassword(): boolean {
    this.processing.set(true);
    this.setAlert(IAlertType.Info, 'het wachtwoord wordt gewijzigd');

    const code = this.typedForm.controls.code.value;
    const password = this.typedForm.controls.password.value;

    // this.activationmessage = undefined;
    this.authService.passwordChange(this.emailaddress, password, code)
      .subscribe({
        next: () => {
          this.passwordChanged = true;
          this.resetAlert();
        },
        error: (e: string) => {
          this.setAlert(IAlertType.Danger, 'het wijzigen van het wachtwoord is niet gelukt: ' + this.errorText(e));
          this.processing.set(false);
        },
        complete: () => this.processing.set(false)
      });
    return false;
  }
}
