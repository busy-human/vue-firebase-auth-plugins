import { User as FirebaseUser, ParsedToken as CustomClaimsToken } from "firebase/auth";
import { AuthRouteMap, MatcherOption, MatcherPattern, UserModelMap, UserModelResolverOptions } from "./types.js";


/**
 * Resolves the correct user model based on the Firebase user, custom claims, etc.
 */
export class UserModelResolver<TypeMap extends UserModelMap> {
    map: TypeMap;
    defaultModel?: keyof TypeMap;
    overrideType?: keyof TypeMap;

    constructor(map: TypeMap, options?: UserModelResolverOptions<TypeMap>) {
        this.map = map;
        this.defaultModel = options?.defaultModel;
        this.overrideType = options?.overrideType;
        this.validate();
    }

    validate() {
        let countWithoutMatchers = 0;
        for(const name in this.map) {
            const def = this.map[name];
            if(!def.matcher) {
                countWithoutMatchers += 1;
            }
        }
        if(countWithoutMatchers > 1) {
            throw new Error("Only one model can have no matcher.");
        } else if(countWithoutMatchers === 1 && !this.defaultModel) {
            throw new Error("A default model must be defined if a model is defined without a matcher.");
        }
    }

    testPatternFields(user: FirebaseUser, pattern: MatcherPattern, field: keyof MatcherPattern): boolean {
        if(field === "claims")  {
            throw new Error("Claims cannot be checked with this test method.");
        }
        if(!(field in pattern) || ! pattern[field]) {
            return true;
        }
        if(!(field in user || user[field as keyof FirebaseUser] === undefined)) {
            return false;
        }
        const userFieldValue = (user as any)[field as keyof FirebaseUser];
        if(typeof pattern[field] === "string") {
            return userFieldValue.includes(pattern[field]);
        } else {
            return pattern[field].test(userFieldValue);
        }
    }
    testClaimFields(claims: CustomClaimsToken, pattern: MatcherPattern, field: keyof CustomClaimsToken): boolean {
        if(!("claims" in pattern) ||! pattern.claims) {
            throw new Error("Claims must be present in the pattern to check claims.");
        }
        if(!(field in pattern.claims) || ! pattern.claims[field]) {
            return true;
        }
        if(!(field in claims || claims[field] === undefined)) {
            return false;
        }
        const claimsFieldValue = claims[field];
        if(claimsFieldValue === undefined) {
            return false;
        }
        if(typeof pattern.claims[field] === "boolean") {
            return claimsFieldValue === pattern.claims[field];

        } else if(typeof pattern.claims[field] === "string") {
            return (claimsFieldValue as string).includes(pattern.claims[field]);

        } else {
            return pattern.claims[field].test(claimsFieldValue as string);
        }
    }

    matchWithPattern(user: FirebaseUser, claims: CustomClaimsToken, pattern: MatcherPattern): boolean {
        let match = true;
        let fields: Array<keyof MatcherPattern> = ["email", "phoneNumber", "uid", "tenantId"];
        for(let f in fields) {
            match = this.testPatternFields(user, pattern, f as keyof MatcherPattern);
            if(!match) {
                return false;
            }
        }
        // Claims is a nested field, so it needs special handling
        if("claims" in pattern) {
            for(let f in pattern.claims) {
                match = this.testClaimFields(claims, pattern, f as keyof CustomClaimsToken);
                if(!match) {
                    return false;
                }
            }
        }
        return match;
    }

    checkTypeWithMatcher(user: FirebaseUser, claims: CustomClaimsToken, matcher?: MatcherOption): boolean {
        if(typeof matcher === "function" && matcher(user, claims) === true) {
            return true;
        } else if(typeof matcher === "object" && this.matchWithPattern(user, claims, matcher)) {
            return true;
        } else if(matcher && (typeof matcher === "function" || typeof matcher === "object")) {
            return false;
        } else if(!matcher || matcher === undefined) {
            return false;
        } else {
            throw new Error(`Matcher invalid or not provided`);
        }
    }

    findMatch<K extends keyof TypeMap>(user: FirebaseUser, claims: CustomClaimsToken, hint?: K): TypeMap[K] | TypeMap[keyof TypeMap] | null {

        const name = this.findMatchTypeName(user, claims, hint);
        if(!name) {
            if(this.defaultModel) {
                throw new Error(`Default model "${String(this.defaultModel)}" not found. Please check your spelling and UserModelMap`);
            }
            throw new Error(`No user model found for user ${user.uid}`);
        }
        return this.map[name] as TypeMap[K];
    }

    findMatchTypeName<K extends keyof TypeMap>(user: FirebaseUser, claims: CustomClaimsToken, hint?: K): K | null {

        if(hint && this.checkTypeWithMatcher(user, claims, this.map[hint].matcher)) {
            return hint;

        } else {
            for(const key in this.map) {
                if(this.checkTypeWithMatcher(user, claims, this.map[key].matcher)) {
                    return key as unknown as K;
                }
            }
            if(this.defaultModel) {
                return this.defaultModel as K;
            }
            throw new Error(`No user model found for user ${user.uid}`);
        }
    }

    private async getOrCreateModel<K extends keyof TypeMap>(match: TypeMap[K], user: FirebaseUser, claims: CustomClaimsToken): Promise< ReturnType<TypeMap[K]["creator"]> > {
        let model = await Promise.resolve(match.getter(user, claims));
        if(!model) {
            model = await Promise.resolve(match.creator(user, claims));
        }
        return model;
    }

    routesForType<K extends keyof TypeMap>(type: K): Partial<AuthRouteMap> | undefined {
        if(!this.map[type]) {
            throw new Error(`User model ${String(type)} not found. Please check your spelling and UserModelMap`);
        }
        return this.map[type].routes;
    }

    resolve<K extends keyof TypeMap>(user: FirebaseUser, claims: CustomClaimsToken,  hint?: K): Promise< ReturnType<TypeMap[K]["creator"]> > {
        const match = this.findMatch(user, claims, hint);
        if(!match) {
            throw new Error(`No user model found for user ${user.uid}`);
        }
        return this.getOrCreateModel(match, user, claims);
    }

    resolveForType<K extends keyof TypeMap>(typeName: K, user: FirebaseUser, claims: CustomClaimsToken): Promise< ReturnType<TypeMap[K]["creator"]> > {
        const match = this.map[typeName];
        if(!match) {
            throw new Error(`User type ${String(typeName)} not found. Please check your spelling and UserModelMap`);
        }
        return this.getOrCreateModel(match, user, claims);
    }

    async getClaimsAndResolve<K extends keyof TypeMap>(user: FirebaseUser, hint?: K): Promise< ReturnType<TypeMap[K]["getter"]> > {
        const {claims} = (await user.getIdTokenResult());
        return this.resolve(user, claims, hint);
    }
}

export function defineUserModels<T extends UserModelMap>(map: T, options?: UserModelResolverOptions<T>): UserModelResolver<T> {
    return new UserModelResolver(map, options);
}