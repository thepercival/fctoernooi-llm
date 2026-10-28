import { Injectable } from '@angular/core';

import { User, UserId } from '../user';

@Injectable({
    providedIn: 'root'
})
export class UserMapper {
    toObject(json: JsonUser): User {
        return new User(new UserId(json.id), json.emailaddress, json.name, json.validated, json.nrOfCredits);
    }
}

// User schema of openapi.yaml
export interface JsonUser {
    id: number;
    emailaddress: string;
    name: string | null;
    validated: boolean;
    nrOfCredits: number;
    subType: 'human' | 'agent';
}

// UserUpdateRequest schema of openapi.yaml
export interface JsonUserUpdate {
    emailaddress?: string;
    name?: string | null;
}
