import {Router} from "vue-router";
import {Auth} from "firebase/auth";
import { AuthGuardOptions } from "./types.js";
import { AuthGuardTracker } from "./guard.js";
import { MainAuth, assertMainAuth } from "./auth-state.js";

class AuthGuardBootstrapper {
    install(router: Router, options: AuthGuardOptions) {
        assertMainAuth();

        const guard = new AuthGuardTracker({
            ...options,
            router
        });

        MainAuth.onChange((data) => {
            if (data.loggedIn && guard.isPublicRoute(router.currentRoute.value.path) && guard.autoRouting.onLogin) {
                // The data.loggedIn just logged in / signed up
                guard.pushTo("postAuth");

            } else if ( ! data.loggedIn && ! guard.isPublicRoute(router.currentRoute.value.path)) {
                // The user just logged out / signed out
                guard.pushTo("publicLanding");

            } else if (data.hasCheckedForSession && guard.deferredRouting) {
                guard.resumeRouting();
            }
        });

        router.beforeEach((to, from, next) => {
            if (!MainAuth.hasCheckedForSession || MainAuth.updatingAuth) {
                console.log(to);
                // We haven't checked for a session yet,
                // Or we are in the middle of updating auth, so wait before routing
                guard.deferredRouting = { to, from, next };
            } else {
                guard.resolveRoute(to, from, next);
            }
        });

        return guard;
    }
};

const AuthGuard = new AuthGuardBootstrapper();

export { AuthGuard };
export default AuthGuard;