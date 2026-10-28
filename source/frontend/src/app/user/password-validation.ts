import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export class CustomValidators {
    static passwordsMatching: ValidatorFn = (
      form: AbstractControl<any, any>
    ): ValidationErrors | null => {
      const password = form.value.password;
      const confirmPassword = form.value.passwordRepeat;
      return equalsOrEmpty(password, confirmPassword)
        ? null
        : { not_matching: true };
    };
  }
  
  function equalsOrEmpty(password: string, confirmPassword: string) {
    return password === confirmPassword && confirmPassword !== undefined;
  }
