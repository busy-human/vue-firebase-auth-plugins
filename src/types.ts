import {NavigationGuardNext, RouteLocationNormalizedGeneric, RouteLocationNormalizedLoadedGeneric, RouteMeta, Router} from "vue-router";
import {User as FirebaseUser, ParsedToken as CustomClaimsToken} from "firebase/auth";

export interface AuthRouteMap {
    /** This is the path to send users to, to login */
    publicLanding: string;

    /** The redirect path after completing login */
    login: string;

    /** Where to redirect users that have logged out to */
    postAuth: string;

    /** Where to send users if they are not authorized to view a particular page */
    notAuthorized: string;
}

export interface AuthGuardOptions {
    routes: Partial< AuthRouteMap > & Pick<AuthRouteMap, "login" | "postAuth">,

    /** If a route isn't listed as 'auth' or 'public', assume this by default: */
    assumeIfUndefined: "auth" | "public";
}

export interface MatcherPattern {
    email?: string | RegExp;
    phoneNumber?: string | RegExp;
    uid?: string | RegExp;
    tenantId?: string | RegExp;
    claims?: {
        [key: string]: RegExp | string | boolean;
    }
}

export interface UserModelResolverOptions<TypeMap extends UserModelMap> {
    /** User type to use if no user type is resolved */
    defaultModel?: keyof TypeMap;

    /** Sets */
    overrideType?: keyof TypeMap;
}

export type MatcherOption = MatcherPattern | ((user: FirebaseUser, claims: CustomClaimsToken) => boolean);

export interface UserModelDefinition<TypeMap extends UserModelMap, TypeName extends keyof TypeMap, M = TypeMap[TypeName]> {
    matcher?: MatcherOption;
    getter: (user: FirebaseUser, claims: CustomClaimsToken) => Promise<M | undefined>;
    creator: (user: FirebaseUser, claims: CustomClaimsToken) => Promise<M>;
    routes?: Partial< AuthRouteMap >;
}

export interface UserModelMap {
    [key: string]: UserModelDefinition<UserModelMap, any>;
}


export type AuthGuardTrackerOptions = Omit<AuthGuardOptions, "modelResolver"> & {
    router: Router;
}

export interface DeferredRouting {
    to: RouteLocationNormalizedGeneric;
    from: RouteLocationNormalizedLoadedGeneric;
    next: NavigationGuardNext;
}

export interface AuthRouteMetaFields<TypeMap extends UserModelMap, TypeName extends keyof TypeMap> {
    requiresAuth?: boolean
    userTypes?: TypeName[]
};

export type AuthRouteMeta<TypeMap extends UserModelMap, TypeName extends keyof TypeMap> = RouteMeta & AuthRouteMetaFields<TypeMap, TypeName>;

export const AUTH_DEFAULTS: AuthGuardOptions = {
    routes: {
        login: "/login",
        publicLanding: "/login",
        postAuth: "/"
    },
    assumeIfUndefined: "auth",
};


export interface AuthStateSnapshot<TypeMap extends UserModelMap, TypeName extends keyof TypeMap> {
    firebaseUser: FirebaseUser | null;
    userModel: TypeMap[TypeName] | null;
    userType: TypeName | null;
    claims: CustomClaimsToken | null;
    loggedIn: boolean;
    hasCheckedForSession: boolean;
    routes?: Partial<AuthRouteMap>;
    uid: string | null;
}

export interface AuthLogOutOptions {
    cleanup?: boolean;
}

export type AuthEvent = "authenticated" | "unauthenticated" | "auth_checked" | "auth_error" | "model_loaded" | "claims_updated" | "snapshot";

export const AuthErrorMap: {[code: string]: string} = {
    'auth/invalid-email': "Invalid Email",
    'auth/user-not-found': "User Not Found",
    'auth/wrong-password': "Password Invalid",
    'auth/email-already-in-use': "Email Already In Use"
};

export type RouteResolver<TypeMap extends UserModelMap, TypeName extends keyof TypeMap> = (authData: AuthStateSnapshot<TypeMap, TypeName>, to: RouteLocationNormalizedGeneric, from: RouteLocationNormalizedLoadedGeneric, next: NavigationGuardNext) => void;