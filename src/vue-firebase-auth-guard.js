/**
 * Import AuthGuard and then call AuthGuard.install(router, auth, options)
 * AuthGuard should be installed before other route guards or interceptors are applied
 */
const {CallbackController} = require("./callbacks.js");
const AuthGuard = {};

const AUTH_DEFAULTS = {
    loginPath:                      "/login",   // This is the path to send users to, to login
    postAuthPath:                   null,       // The redirect path after completing login
    publicLanding:                  "/login",   // Where to redirect users that have logged out to
    assumeIfUndefined:              "auth",     // If a route doesn't explicitly specify whether it requiresAuth or not, assume this
};

function resolveOptions(defaults, overrides) {
    var resolved = Object.assign({}, defaults);
    Object.keys(overrides).forEach(key => {
        if(overrides[key] !== undefined) {
            resolved[key] = overrides[key];
        }
    });

    return resolved;
}

/**
 * @typedef {Object} AuthGuardOptions
 * @prop {String} postAuthPath - Determines where to redirect to after authentication (required)
 * @prop {String} [loginPath] - The path to send to prompt for login
 * @prop {String} [publicLanding] - Where to send guests upon first getting into the app
 * @prop {String} [assumeIfUndefined] - If a route isn't listed as 'auth' or 'public', assume this by default:
 */

/**
 * AuthGuard.install(router, auth, options)
 * options.postAuthPath 
 * @param {VueRouter} router
 * @param {Firebase.Auth} auth
 * @param {AuthGuardOptions} options
 */
AuthGuard.install = function(router, auth, {loginPath,postAuthPath,publicLanding,assumeIfUndefined}=AUTH_DEFAULTS) {
    var onCheckedForSessionCallbacks = new CallbackController();
    router.hasCheckedForSession = false;
    router.deferredRouting = null;

    AuthGuard.config = resolveOptions(AUTH_DEFAULTS, {loginPath,postAuthPath,publicLanding,assumeIfUndefined});

    if(!AuthGuard.config.postAuthPath) {
        console.warn('You must pass in postAuthPath with the AuthGuard.install options');
    }

    function resolvePostAuthPath() {
        if(typeof AuthGuard.config.postAuthPath === "function") {
            return Promise.resolve(AuthGuard.config.postAuthPath(router, router.user));
        } else {
            return Promise.resolve(AuthGuard.config.postAuthPath);
        }        
    }

    /**
     * Listen for changes to the user. The first event on this represents a successful session check
     */
    auth.onAuthStateChanged((user) => {
        router.user = user;

        if(!router.hasCheckedForSession) {
            router.hasCheckedForSession = true;
            router.resumeRouting();
        } else if(user && router.isPublicRoute( router.currentRoute.value.path)) {
            // The user just logged in / signed up
            resolvePostAuthPath()
                .then(path => {
                    router.push(path);
                })
        } else if(!user) {
            // The user just logged out / signed out
            router.push(AuthGuard.config.publicLanding);
        }
    });
    
    function resolveMeta(routeOrRouteLike) {
        return routeOrRouteLike.meta || routeOrRouteLike.route.meta;
    }

    router.onCheckedForSession = function(callback) {
        onCheckedForSessionCallbacks.add(callback, { once: true });
    }

    /**
     * Public Routes do not require authentication
     */
    router.isPublicRoute = function( path ) {
        var isPublic = AuthGuard.config.assumeIfUndefined === "public" ? true : false;
        var resolvedRoute = router.resolve(path);
        if(router.isLoginPage(path)) {
            isPublic = true;
        } else if(resolvedRoute) {
            let requiresAuth = resolveMeta(resolvedRoute) ? resolveMeta(resolvedRoute).requiresAuth : undefined;
            isPublic = requiresAuth === undefined ? isPublic : !requiresAuth;
        }

        return isPublic;
    };

    router.isLoginPage = function( path ) {
        var pathStr = path.fullPath || path;
        return pathStr.indexOf(AuthGuard.config.loginPath) >= 0;
    };

    /**
     * Users must be logged in to view authenticated routes
     */
    router.isAuthenticatedRoute = function( path ) {
        var requiresAuth = AuthGuard.config.assumeIfUndefined === "auth" ? true : false;

        var resolvedRoute = router.resolve(path);
        if(router.isLoginPage(path)) {
            requiresAuth = false;
        } else if(resolvedRoute && resolveMeta(resolvedRoute) && resolveMeta(resolvedRoute).requiresAuth !== undefined) {
            requiresAuth = resolveMeta(resolvedRoute).requiresAuth;
        }      

        return requiresAuth;
    };

    /**
     * Checks whether the user is permitted to navigate to the route
     */
    router.resolvePath = function( to, from, next ) {
        var toPath      = to.path || to;
        var fromPath    = from.path || from;

        var requiresAuth = router.isAuthenticatedRoute(toPath);
        var authorizedToView = !requiresAuth || auth.currentUser;

        if(authorizedToView) {
            next();
        } else {
            next(AuthGuard.config.loginPath);
        }       
    };
    
    router.resumeRouting = function() {
        if(router.deferredRouting && (router.isPublicRoute(router.deferredRouting.to) || auth.currentUser)) {
            console.log("Resuming attempted routing");
            var rt = router.deferredRouting;
            router.deferredRouting = null;
            if(router.user && router.isLoginPage(rt.to)) {
                resolvePostAuthPath()
                    .then(path => {
                        router.push(path);
                    });
            } else {
                router.resolvePath(rt.to, rt.from, rt.next);
            }
        } else if(auth.currentUser) {
            console.log("Router: User logged in");
            router.push(AuthGuard.config.postAuthPath);
            onCheckedForSessionCallbacks.run( {router} );
        } else {
            console.log("Router: No session");   
            router.push(AuthGuard.config.loginPath);
            onCheckedForSessionCallbacks.run( {router} );
        }
    };    

    router.beforeEach((to, from, next) => {
        if(!router.hasCheckedForSession) {
            console.log(to);
            // We haven't checked for a session yet, so wait before routing
            router.deferredRouting = { to, from, next };
        } else {
            router.resolvePath( to, from, next );
        }
    });
};

export {AuthGuard};
export default AuthGuard;