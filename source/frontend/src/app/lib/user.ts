export class UserId {
    constructor(protected id: number) {
    }

    getId(): number {
        return this.id;
    }
}


export class User {
    static readonly MIN_LENGTH_EMAIL = 6;
    static readonly MAX_LENGTH_EMAIL = 100;
    static readonly MIN_LENGTH_PASSWORD = 8;
    static readonly MAX_LENGTH_PASSWORD = 50;
    static readonly MAX_LENGTH_NAME = 15;

    constructor(
        protected userId: UserId,
        protected emailaddress: string,
        protected name: string | null,
        protected validated: boolean,
        protected nrOfCredits: number
    ) {
    }

    getId(): number {
        return this.userId.getId();
    }

    getEmailaddress(): string {
        return this.emailaddress;
    }

    getName(): string | null {
        return this.name;
    }

    getValidated(): boolean {
        return this.validated;
    }

    getNrOfCredits(): number {
        return this.nrOfCredits;
    }
}
