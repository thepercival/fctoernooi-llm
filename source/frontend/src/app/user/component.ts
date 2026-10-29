import { signal, WritableSignal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../lib/auth/auth.service';
import { User } from '../lib/user';
import { UserRepository } from '../lib/user/repository';
import { IAlert, IAlertType } from '../shared/common/alert';
import { GlobalEventsManager } from '../shared/common/eventmanager';
import { faCheckCircle, faKey, faLevelUpAlt, faMoneyBillAlt, faSignInAlt, faSpinner, faUserCircle } from '@fortawesome/free-solid-svg-icons';


export abstract class UserComponent {
    public readonly faCheckCircle = faCheckCircle;
    public readonly faKey = faKey;
    public readonly faLevelUpAlt = faLevelUpAlt;
    public readonly faMoneyBillAlt = faMoneyBillAlt;
    public readonly faSignInAlt = faSignInAlt;
    public readonly faSpinner = faSpinner;
    public readonly faUserCircle = faUserCircle;

    public user: User | undefined;

    public alert: WritableSignal<IAlert|undefined> = signal(undefined);
    public processing: WritableSignal<boolean> = signal(true);

    constructor(
        protected route: ActivatedRoute,
        protected router: Router,
        protected userRepository: UserRepository,
        public authService: AuthService,
        protected globalEventsManager: GlobalEventsManager
    ) {
    }

    // repositories reject with an Error; show its message, not "Error: message"
    protected setAlert(type: IAlertType, message: string | Error) {
        this.alert.set({ 'type': type, 'message': message instanceof Error ? message.message : message });
    }

    protected errorText(e: unknown): string {
        return e instanceof Error ? e.message : String(e);
    }

    protected resetAlert(): void {
        this.alert.set(undefined);
    }
}