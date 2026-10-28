import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, NavigationExtras, Router, RouterModule } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NgbAlert } from '@ng-bootstrap/ng-bootstrap';

import { IAlertType } from '../../shared/common/alert';
import { User } from '../../lib/user';
import { UserRepository } from '../../lib/user/repository';
import { AuthService } from '../../lib/auth/auth.service';
import { MyNavigation } from '../../shared/common/navigation';
import { JsonUserUpdate } from '../../lib/user/mapper';
import { UserComponent } from '../component';
import { GlobalEventsManager } from '../../shared/common/eventmanager';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';

@Component({
    selector: 'app-profile',
    templateUrl: './profile.component.html',
    styleUrls: ['./profile.component.css'],
    standalone: true,
  imports: [FontAwesomeModule, NgbAlert, ReactiveFormsModule, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProfileComponent extends UserComponent implements OnInit {
  myNavigation = inject(MyNavigation);

  faSpinner = faSpinner;
  public typedForm: FormGroup<{
    emailaddress: FormControl<string>,
    name: FormControl<string>
  }>;

  validations: UserValidations = {
    minlengthemailaddress: User.MIN_LENGTH_EMAIL,
    maxlengthemailaddress: User.MAX_LENGTH_EMAIL,
    maxlengthname: User.MAX_LENGTH_NAME
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
      name: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(this.validations.maxlengthname)] }),
    });
  }

  ngOnInit() {
    this.userRepository.getLoggedInObject()
      .subscribe({
        next: (loggedInUser: User | undefined) => {
          if (loggedInUser === undefined) {
            const navigationExtras: NavigationExtras = {
              queryParams: { type: IAlertType.Danger, message: 'je bent niet ingelogd' }
            };
            this.router.navigate([''], navigationExtras);
            return;
          }
          this.user = loggedInUser;
          this.typedForm.controls.emailaddress.setValue(this.user.getEmailaddress());
          this.typedForm.controls.name.setValue(this.user.getName() ?? '');
        },
        error: (e: string) => {
          this.setAlert(IAlertType.Danger, e); this.processing.set(false);
        },
        complete: () => this.processing.set(false)
      });
  }

  protected formToJson(): JsonUserUpdate {
    return {
      emailaddress: this.typedForm.controls.emailaddress.value,
      name: this.typedForm.controls.name.value.trim() || null
    }
  }

  save(user: User): boolean {
    this.processing.set(true);


    this.userRepository.editObject(user.getId(), this.formToJson())
      .subscribe({
        next: (user: User) => {
          this.user = user;
          this.setAlert(IAlertType.Success, 'het profiel is opgeslagen');
          this.typedForm.controls.emailaddress.setValue(user.getEmailaddress());
          this.typedForm.controls.name.setValue(user.getName() ?? '');
        },
        error: (e: string) => {
          this.setAlert(IAlertType.Danger, 'het opslaan is niet gelukt: ' + this.errorText(e)); this.processing.set(false);
        },
        complete: () => {
          this.processing.set(false)
        }
      });
    return false;
  }

  remove(user: User) {
    this.processing.set(true);
    this.userRepository.removeObject(user.getId())
      .subscribe({
        next: () => {
          this.authService.logout();
          this.router.navigate(['']);
        },
        error: (e: string) => {
          this.setAlert(IAlertType.Danger, 'het opslaan is niet gelukt: ' + this.errorText(e)); this.processing.set(false);
        },
        complete: () => this.processing.set(false)
      });
  }
}

export interface UserValidations {
  minlengthemailaddress: number;
  maxlengthemailaddress: number;
  maxlengthname: number;
}
