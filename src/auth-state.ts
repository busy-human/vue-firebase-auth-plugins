import { Auth, User as FirebaseUser, ParsedToken as CustomClaimsToken } from "firebase/auth";
import { FirebaseError } from "@firebase/util";
import { UserModelResolver } from "./user-model-resolver.js";
import { CallbackController, Callback } from "./callbacks.js";
import { AuthStateSnapshot, AuthEvent, AuthErrorMap, AuthLogOutOptions, AuthRouteMap, UserModelMap } from "./types.js";



export class AuthStateClass<TypeMap extends UserModelMap> {
    auth                        : Auth;
    firebaseUser                : FirebaseUser | null;
    userModel                   : TypeMap[any] | null;
    claims                      : CustomClaimsToken | null;
    userType                    : keyof TypeMap | null;
    resolver                   ?: UserModelResolver<TypeMap>;
    userRoutes                 ?: Partial<AuthRouteMap>;
    uid                        ?: string | null;
    hasCheckedForSession        = false;
    updatingAuth                = false;

    private onAuthStateChangedCallbacks  : CallbackController<AuthStateSnapshot<TypeMap, any>>;
	private onPreAuthLogoutHookCallbacks : CallbackController<void>;
    private onUserModelChangedCallbacks  : CallbackController<TypeMap[any] | null>;
    private onUnAuthenticatedCallbacks   : CallbackController<AuthStateSnapshot<TypeMap, any>>;
    private onUserTypeChangedCallbacks   : CallbackController<{ old: keyof TypeMap | null, new: keyof TypeMap | null }>;

    constructor(auth: Auth, resolver?: UserModelResolver<TypeMap>) {
        this.auth = auth;
        this.firebaseUser = null;
        this.userModel = null;
        this.resolver = resolver;
        this.claims = null;
        this.userType = null;
        this.uid = null;
        this.onAuthStateChangedCallbacks  = new CallbackController<AuthStateSnapshot<TypeMap, any>>();
        this.onPreAuthLogoutHookCallbacks = new CallbackController();
        this.onUserModelChangedCallbacks  = new CallbackController<TypeMap[any] | null>();
        this.onUnAuthenticatedCallbacks   = new CallbackController<AuthStateSnapshot<TypeMap, any>>();
        this.onUserTypeChangedCallbacks    = new CallbackController<{ old: keyof TypeMap | null, new: keyof TypeMap | null }>();
    }

    get loggedIn() {
        return !!this.auth.currentUser;
    }

    /**
     * Returns a snapshot of the current auth state.
     * @param eventName
     * @returns
     */
    getSnapshot(eventName:AuthEvent = "snapshot") {
        return {
            firebaseUser         : this.firebaseUser,
            userModel            : this.userModel,
            userType             : this.userType,
            claims               : this.claims,
            loggedIn             : this.loggedIn,
            hasCheckedForSession : this.hasCheckedForSession,
            routes               : this.userRoutes,
            uid                  : this.firebaseUser?.uid || null,
            eventName
        };
    }

    /**
     * Replaces the current user model with the one provided.
     * @param model
     * @param typeName
     */
    setUserModel<TypeName extends keyof TypeMap>(model: TypeMap[any], typeName: TypeName) {
        const prevType = this.userType;
        this.userModel = model;
        this.userType = typeName;
        console.log(`User model updated to ${String(typeName)}`, model);
        this.onAuthStateChangedCallbacks.run( this.getSnapshot("model_loaded") );
        this.onUserModelChangedCallbacks.run( this.userModel );
        if(prevType !== this.userType) {
            this.onUserTypeChangedCallbacks.run({ old: prevType, new: typeName });
        }
    }

    /**
     * Updates the field values does NOT change the model type or trigger
     * the model_updated event; but DOES trigger the user model changed event.
     * @param fields
     */
    updateUserModelFields(hash: Partial<TypeMap[any]>) {
        if(!this.userModel) {
            throw new Error("No user model defined");
        }
        for(let field in hash) {
            if(hash[field] === undefined) continue;
            this.userModel[field] = hash[field];
        }
        this.onUserModelChangedCallbacks.run( this.userModel );
    }

    /**
     * Forces the user model to be resolved from a specific type.
     * @param typeName
     * @returns
     */
    async setOverrideUserType<TypeName extends keyof TypeMap>(typeName?: TypeName) {
        if(!this.resolver) {
            throw new Error("No user model resolver defined");
        }
        const prevType = this.userType;

        this.resolver.overrideType = typeName;
        await this.resolveUserModel();
        const snap = this.getSnapshot("model_loaded");
        this.onAuthStateChangedCallbacks.run( snap );
        if(prevType !== this.userType) {
            this.onUserTypeChangedCallbacks.run({ old: prevType, new: typeName });
        }
        return snap;
    }

    clearOverrideUserType() {
        return this.setOverrideUserType();
    }

    async resolveUserModel() {
        if(this.resolver && this.firebaseUser && this.claims) {

            if(this.resolver.overrideType) {
                // Resolve with the override type
                console.log("Resolver.overtype",this.resolver.overrideType);
                this.userType = this.resolver.overrideType;
                console.log("user type",this.userType);
                this.userModel = await this.resolver.resolveForType(this.resolver.overrideType, this.firebaseUser, this.claims);
                console.log("user model", this.userModel);

            } else {
                // Resolve with the best match type
                this.userType = await this.resolver.findMatchTypeName(this.firebaseUser, this.claims);
                console.log("got usertype", this.userType);
                if(!this.userType) throw new Error(`No user model found for user ${this.firebaseUser.uid}`);
                this.userModel = await this.resolver.resolve(this.firebaseUser, this.claims, this.userType);
                console.log("resolver ",this.userModel);
            }
            this.userRoutes = this.resolver.routesForType(this.userType);
            console.log("Routes:",this.userRoutes);
        } else {
            this.userType = null;
            this.userModel = null;
            this.userRoutes = undefined;
        }
        console.log("After resolve user Model:", this.userModel);
        return this.userModel;
    }

    startListener() {
        // Listen for changes to the auth state
        this.auth.onAuthStateChanged(async (user) => {
            this.onAuthStateChangedHandler(user);
        });
    }

    /**
     * Handles changing the auth state (firebase user)
     * @param user
     */
    private async onAuthStateChangedHandler(user: FirebaseUser | null) {
        try {
            this.updatingAuth = true;
            let eventName: AuthEvent;
            if(user) {
                this.firebaseUser = user;
                this.uid = user.uid;
                this.claims = (await user.getIdTokenResult()).claims;
                await this.resolveUserModel();
                eventName = "authenticated";
            } else {
                this.firebaseUser = null;
                this.uid = null;
                this.userModel = null;
                this.claims = null;
                eventName = "unauthenticated";
            }
            this.hasCheckedForSession = true;
            this.updatingAuth = false;

            // Run callbacks (if any)
            if(eventName === "unauthenticated") {
                this.onUnAuthenticatedCallbacks.run( this.getSnapshot(eventName) );
            }
            this.onAuthStateChangedCallbacks.run( this.getSnapshot(eventName) );
        } catch(err: any) {
            if("code" in err) {
                this.logFirebaseError(err);
            } else {
                console.warn("An error occurred on the auth state manager: ", err.message);
                console.error(err);
                this.updatingAuth = false;
            }
        }
    }

    convertAuthError(errorCode: string) {
        // return AuthErrorMap[errorCode] || "Unknown"
        return AuthErrorMap[errorCode] || errorCode;
    }

    logFirebaseError(error: FirebaseError) {
        const readable = this.convertAuthError(error.code);
        console.warn(`Firebase Error: ${readable}`);
        console.error(error);
    }

    /**
     * Sets up a callback to be ran when the auth state changes.
     * @param cb
     * @param options
     */
    onChange(cb: Callback<AuthStateSnapshot<TypeMap, any>>, options: {once: boolean} = { once: false }) {
        this.onAuthStateChangedCallbacks.add(cb, { once: options.once });
    }

    /**
     * Sets up a callback to be ran when the user model changes.
     * @param cb
     * @param options
     */
    onUserModelChanged(cb: Callback<TypeMap[any] | null>, options: {once: boolean} = { once: false }) {
        this.onUserModelChangedCallbacks.add(cb, { once: options.once });
    }

    onUnAuthenticated(cb: Callback<AuthStateSnapshot<TypeMap, any>>, options: {once: boolean} = { once: false }) {
        /** Sets up a callback to be ran when the user is unauthenticated */
        this.onUnAuthenticatedCallbacks.add(cb, { once: options.once });
    }

    onUserTypeChanged(cb: Callback<{ old: keyof TypeMap | null, new: keyof TypeMap | null }>, options: { once: boolean } = { once: false }) {
        /** Sets up a callback to be ran when the user type changes */
        this.onUserTypeChangedCallbacks.add(cb, { once: options.once });
    }

	/** Sets up a callback to be ran before full unauthenticating, for cleaning up firestore things */
	onPreLogout(cb: Callback<void>, options: { once: boolean } = { once: false }) {
		this.onPreAuthLogoutHookCallbacks.add(cb, options);
	}

    async refreshClaims() {
        if(this.loggedIn && this.firebaseUser) {
            this.claims = (await this.firebaseUser.getIdTokenResult()).claims;
            if(this.resolver) {
                this.userModel = await this.resolver.resolve(this.auth.currentUser!, this.claims);
            }

            // Run callbacks (if any)
            this.onAuthStateChangedCallbacks.run( this.getSnapshot("claims_updated") );

            return this.claims;
        } else {
            throw new Error("Cannot refresh claims when not authenticated.");
        }
    }

    waitForAuthCheck() {
        return new Promise((resolve) => {
            if(this.hasCheckedForSession) {
                resolve( this.getSnapshot("auth_checked") );
            } else {
                this.onAuthStateChangedCallbacks.add((data) => {
                    if(data.hasCheckedForSession) {
                        resolve(data);
                    }
                }, { once: true });
            }
        });
    }

    /**
     * Advanced method; use this to manually set the firebase user
     * in cases where a special authentication method is used or
     * required outside of what this module supports/provides.
     * @param user
     */
    overrideFirebaseUser(user: FirebaseUser | null) {
        this.auth.updateCurrentUser(user);
    }

    async signOut(options: AuthLogOutOptions = { cleanup: false }) {
		this.onPreAuthLogoutHookCallbacks.run(null);
        await this.auth.signOut();
        this.firebaseUser = null;
        this.userModel = null;
        this.hasCheckedForSession = false;

        // Run callbacks (if any)
        this.onAuthStateChangedCallbacks.run( this.getSnapshot("unauthenticated") );

        if(options.cleanup) {
            // Clear any pending callbacks
            this.onAuthStateChangedCallbacks.cleanup();
            this.onUserModelChangedCallbacks.cleanup();
        }
    }
}

export let MainAuth: AuthStateClass<any>;

export function initializeAuthState<TypeMap extends UserModelMap>(auth: Auth, resolver?: UserModelResolver<TypeMap>) {
    if(MainAuth) {
        console.warn("AuthState already initialized, will only initialize once.");
        return MainAuth;
    }

    MainAuth = new AuthStateClass(auth, resolver);
    MainAuth.startListener();
    console.log("AuthState initialized", MainAuth);
    return MainAuth;
}

export function assertMainAuth() {
    if(!MainAuth) {
        throw new Error('MainAuth not initialized, please ensure to call initializeAuthState first');
    }
}