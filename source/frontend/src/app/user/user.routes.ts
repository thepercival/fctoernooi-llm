import { Routes } from '@angular/router';
import { RegisterComponent } from './register/register.component';
import { LoginComponent } from './login/login.component';
import { PasswordresetComponent } from './passwordreset/passwordreset.component';
import { AuthguardService } from '../lib/auth/authguard.service';
import { LogoutComponent } from './logout/logout.component';
import { PasswordchangeComponent } from './passwordchange/passwordchange.component';
import { ProfileComponent } from './profile/profile.component';
import { ValidateComponent } from './validate/validate.component';



export const userRoutes: Routes = [  
    { path: 'register', component: RegisterComponent },
    { path: 'login', component: LoginComponent },
    { path: 'passwordreset', component: PasswordresetComponent },
    { path: 'passwordchange', component: PasswordchangeComponent },
    { path: 'logout', component: LogoutComponent },
    { path: 'profile', component: ProfileComponent, canActivate: [AuthguardService] },
    { path: 'validate/:code', component: ValidateComponent, canActivate: [AuthguardService] },
    { path: 'validate', component: ValidateComponent, canActivate: [AuthguardService] },
];

