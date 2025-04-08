import { Auth, User as FirebaseUser } from "firebase/auth";
import { Router, RouteLocationNormalizedGeneric, RouteLocationNormalizedLoadedGeneric, NavigationGuardNext, RouteLocationResolvedGeneric } from "vue-router";
import { CallbackController, Callback } from "./callbacks.js";
import { AuthGuardOptions, DeferredRouting, AuthGuardTrackerOptions, AUTH_DEFAULTS, AuthRouteMeta, AuthRouteMap, UserModelMap, AuthStateSnapshot} from "./types.js";
import { MainAuth } from "./auth-state.js";

function resolveOptions(defaults: AuthGuardOptions, overrides: Partial<AuthGuardOptions>) {
    return Object.assign({}, defaults, overrides);
}

function resolveMeta<TypeMap extends UserModelMap>(routeOrRouteLike: RouteLocationNormalizedGeneric | RouteLocationResolvedGeneric): AuthRouteMeta<TypeMap, keyof TypeMap> {
    return routeOrRouteLike.meta;
}

type ResumeRoutingCallbackOptions = {
    router: Router;
}

export class AuthGuardTracker {
    router                      : Router;
    config                      : AuthGuardOptions = AUTH_DEFAULTS;
    userRouting?                : Partial<AuthRouteMap>;
    deferredRouting?            : DeferredRouting;
    onCheckedForSessionCallbacks: CallbackController<ResumeRoutingCallbackOptions>;
    autoRouting: {
        onLogin: boolean;
    };
    routingMutexLock?: Promise<void>;

    constructor(options: AuthGuardTrackerOptions) {
        this.router = options.router;
        this.onCheckedForSessionCallbacks = new CallbackController();
        this.config = resolveOptions(AUTH_DEFAULTS, options);
        this.autoRouting = {
            /** Whether the router will automatically try to navigate on login */
            onLogin: true
        };

        // Track changes to the user routing
        MainAuth.onChange((data) => {
            this.userRouting = data.routes;
        });

        if (!this.config.routes.postAuth) {
            console.warn('You must pass in postAuth with the AuthGuard.install options');
        }
    }
    onCheckedForSession(callback: Callback<ResumeRoutingCallbackOptions>) {
        this.onCheckedForSessionCallbacks.add(callback, { once: true });
    }
    pathFor(routeType: "login"): string;
    pathFor(routeType: keyof AuthRouteMap): string | undefined;
    pathFor(routeType: keyof AuthRouteMap) {
        return this.userRouting?.[routeType] || this.config.routes[routeType];
    }
    /**
     * Public Routes do not require authentication
     */
    isPublicRoute(pathOrRoute: string | RouteLocationNormalizedGeneric) {
        const path = typeof pathOrRoute === "string"? pathOrRoute : pathOrRoute.path;
        let isPublic: boolean = this.config.assumeIfUndefined === "public" ? true : false;
        var resolvedRoute = this.router.resolve(path);
        if (this.isLoginPage(path)) {
            isPublic = true;
        } else if (resolvedRoute) {
            let requiresAuth = resolveMeta(resolvedRoute).requiresAuth;
            isPublic = requiresAuth === undefined ? isPublic : !requiresAuth;
        }

        return isPublic;
    }
    pushTo(routeType: keyof AuthRouteMap, noFail = false) {
        const path = this.pathFor(routeType);
        if(!path) {
            if(noFail) {
                console.warn("Route not found: ", routeType);
                return;
            } else {
                console.log(this.config);
                throw new Error(`Failed to resolve ${routeType}`);
            }
        }
        this.router.push(path);
    }
    /**
     * Temporarily lock the auth guard routing
     * This is useful for when you want to do something before the router is allowed to resume
     * @param promiseOrCallback
     * @returns
     */
    async lockRoutingUntilResolved(promiseOrCallback: Promise<void> | (() => Promise<void>)) {
        if(this.routingMutexLock) {
            throw new Error("AuthGuard only supports one lock at a time");
        }
        if(promiseOrCallback instanceof Promise) {
            this.routingMutexLock = promiseOrCallback;
        } else if (typeof promiseOrCallback === "function") {
            this.routingMutexLock = new Promise((resolve, reject) => {
                promiseOrCallback().then(() => {
                    resolve();
                }).catch((e) => {
                    reject(e);
                });
            });
        }
        await this.routingMutexLock;
    }
    async resumeRouting() {
        if(this.routingMutexLock) {
            await this.routingMutexLock;
            this.routingMutexLock = undefined;
        }
        if (this.deferredRouting && (this.isPublicRoute(this.deferredRouting.to) || MainAuth.loggedIn)) {
            console.log("Resuming attempted routing");
            const rt = this.deferredRouting;
            delete this.deferredRouting;
            if (MainAuth.loggedIn && this.isLoginPage(rt.to)) {
                const postAuth = this.pathFor("postAuth");
                if(postAuth && typeof postAuth === "string") {
                    rt.next( postAuth );
                } else {
                    rt.next();
                }
            } else {
                this.resolveRoute(rt.to, rt.from, rt.next);
            }
        } else if (MainAuth.loggedIn) {
            console.log("Router: User logged in");
            await this.pushTo("postAuth");
            this.onCheckedForSessionCallbacks.run({ router: this.router });
        } else {
            console.log("Router: No session");
            this.router.push(this.config.routes.login);
            this.onCheckedForSessionCallbacks.run({ router: this.router });
        }
    }

    isLoginPage(path: string | RouteLocationNormalizedGeneric) {
        var pathStr = (typeof path === "string" ? path : path.fullPath);
        return pathStr.indexOf(this.config.routes.login) >= 0;
    };

    /**
     * Users must be logged in to view authenticated routes
     */
    isAuthenticatedRoute(path: string | RouteLocationNormalizedGeneric) {
        let requiresAuth = this.config.assumeIfUndefined === "auth" ? true : false;

        const resolvedRoute = this.router.resolve(path);
        if (this.isLoginPage(path)) {
            requiresAuth = false;
        } else if (resolvedRoute && resolveMeta(resolvedRoute) && resolveMeta(resolvedRoute).requiresAuth !== undefined) {
            requiresAuth = !!resolveMeta(resolvedRoute).requiresAuth;
        }

        return requiresAuth;
    };

    /**
     * Returns whether the view's userType list permits this user to view it
     * If there are no userTypes specified, allow all user types
     * @param to
     * @returns
     */
    userListAllowsUser(to: RouteLocationNormalizedGeneric) {
        const meta = resolveMeta(to);

        // If there are no user types specified, allow all user types
        if(!meta?.userTypes) {
            return true;
        }

        const result = meta.userTypes.includes(`${String(MainAuth.userType)}`);
        if(!result) {
            console.warn(`User "${String(MainAuth.userType)}" is not authorized to view ${to.fullPath}. Expected one of: ${meta.userTypes.join(', ')}`);
        }
        return result;
    }

    /**
     * Checks whether the user is permitted to navigate to the route
     * And navigates to the appropriate page
     */
    resolveRoute( to: RouteLocationNormalizedGeneric, from: RouteLocationNormalizedLoadedGeneric, next: NavigationGuardNext) {
        var toPath = to.path || to;

        var requiresAuth = this.isAuthenticatedRoute(toPath);

        if (!requiresAuth || MainAuth.loggedIn) {
            var userTypeAllowed = this.userListAllowsUser(to);
            if(userTypeAllowed) {
                next();
            } else {
                const noAuthPath = this.pathFor("notAuthorized");
                if(noAuthPath) {
                    next(noAuthPath);
                } else {
                    console.warn("Route not authorized: ", toPath);
                    next(false);
                }
            }
        } else {
            next(this.pathFor("login"));
        }
    };

    /**
     * Convenience method that creates a special version of router.beforeEach that includes auth data
     * @param to
     * @param from
     * @param next
     */
    beforeEach(fn: (authData: AuthStateSnapshot<any, any>, to: RouteLocationNormalizedGeneric, from: RouteLocationNormalizedLoadedGeneric, next: NavigationGuardNext) => void ) {
        this.router.beforeEach(async (to, from, next) => {
            fn(MainAuth.getSnapshot(), to, from, next);
        });
    }
}