import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NgbAlert } from '@ng-bootstrap/ng-bootstrap';

import { AuthService } from '../../lib/auth/auth.service';
import { IAlertType } from '../../shared/common/alert';
import { User } from '../../lib/user';
import { UserComponent } from '../component';
import { UserRepository } from '../../lib/user/repository';
import { GlobalEventsManager } from '../../shared/common/eventmanager';
import { UserTitleComponent } from '../title/title.component';
import { faKey, faSpinner } from '@fortawesome/free-solid-svg-icons';

@Component({
    selector: 'app-passwordreset',
    templateUrl: './passwordreset.component.html',
    styleUrls: ['./passwordreset.component.css'],
    standalone: true,
  imports: [FontAwesomeModule, NgbAlert, ReactiveFormsModule, RouterModule, UserTitleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PasswordresetComponent extends UserComponent implements OnInit {
  codeSend = false;
  public typedForm: FormGroup<{
    emailaddress: FormControl<string>
  }>;
  public faSpinner = faSpinner;
  faKey = faKey;

  validations: any = {
    minlengthemailaddress: User.MIN_LENGTH_EMAIL,
    maxlengthemailaddress: User.MAX_LENGTH_EMAIL
  };
  constructor() {
    const route = inject(ActivatedRoute);
    const router = inject(Router);
    const userRepository = inject(UserRepository);
    const authService = inject(AuthService);
    const globalEventsManager = inject(GlobalEventsManager);

    super(route, router, userRepository, authService, globalEventsManager);
    this.typedForm = new FormGroup(
      {
        emailaddress: new FormControl('', { nonNullable: true, validators: 
          [
              Validators.required,
              Validators.minLength(this.validations.minlengthemailaddress),
              Validators.maxLength(this.validations.maxlengthemailaddress)
          ] 
        })
      }
    );
  }

  ngOnInit() {
    this.processing.set(false);
  }

  sendCode(): boolean {
    this.processing.set(true);
    this.setAlert(IAlertType.Info, 'de code wordt verstuurd');

    const emailaddress = this.typedForm.controls.emailaddress.value;

    // this.activationmessage = undefined;
    this.authService.passwordReset(emailaddress).subscribe({
      next: () => {
        this.codeSend = true;
        this.resetAlert();
      },
      error: (e: string) => {
        this.setAlert(IAlertType.Danger, 'het verzenden van de code is niet gelukt: ' + this.errorText(e)); this.processing.set(false);
      },
      complete: () => this.processing.set(false)
    });
    return false;
  }

}
