# vue-firebase-auth-plugins

Plugins that can be installed in your Vue project for authentication to help with routing and waiting for user authentication to complete before rendering a view.

## AuthGuard Vue Router Middleware

To be used with Firebase Authentication, this helps protect certain views that require authentication. AuthGuard will intercept every routing request, check for authentication, and redirect the request if the user is not authenticated for views requiring authentication. Setup is straightforward:

    // Install the AuthGuard on the router you want protected
    import {AuthGuard} from "vue-firebase-auth-plugins";
    AuthGuard.install(routerInstance, Firebase.auth(), { postAuthPath: "/dashboard" });

Because this hooks into Firebase.Auth directly, no additional wiring is needed to make it work. It will monitor Firebase.Auth for changes to authentication and will automatically apply the routing logic to respond.

Once installed, AuthGuard will look for meta.requiresAuth on your routes to determine whether the route is protected or not.

    var routes = [
        { path: '/login', component: LoginView, name: "Login"},
        { path: '/dashboard', component: DashboardView, name: "Dashboard", meta: { requiresAuth: true } },
    ]

By default, AuthGuard will assume a route requires auth. This can be changed by specifying assumeIfUndefined on the options object passed into AuthGuard.install

    // In this example routes will be presumed public and only require auth if specified
    AuthGuard.install(routerInstance, Firebase.auth(), { postAuthPath: "/dashboard", assumeIfUndefined: "public" });

### Installation

If you are using ES6+, you can simply use import "vue-firebase-auth-plugins". But if you need to use it in an ES5 environment, or Node.js, you'll want to use /dist/index.es5.js when importing/requiring.


    // If you are using require/ES5
    const { AuthGuard } = require("vue-firebase-auth-plugins/dist/index.es5.js");

    // Or in ES6+
    import Vue from "vue";
    import VueRouter from "vue-router";
    import { AuthGuard } from "vue-firebase-auth-plugins";
    import firebase from "firebase/app";
    import "firebase/auth";
    
    var myRouter = new VueRouter(...);

    Vue.use(AuthGuard, { auth: firebase.auth(), router: myRouter });


### Usage

You can specify whether or not a specific route requires authentication on the meta object on the route data object.

    var myRouter = new VueRouter({
        { path: '/login', component: LoginView, name: "Login", meta: { requiresAuth: false } },
    });

**IMPORATNT:** Ensure that this is the first plugin or middleware to touch Vue Router to make sure it prevents unwanted navigation

### How it Works

Because there's a variable delay in waiting to know if we are actually authenticated (or have a session we can re-use), the AuthGuard starts by suspending routing until know.

### Changing the default assumption

If most of your app requires authentication, the plugin works out of the box for your setup. If most of your app does not require authentication, you'll want to flip the default from "auth" to "public". You can just do this before you call Vue.use.

    AuthGuard.config.assumeIfUndefined = "public";

You only need to specify whether a route requires authentication, or is public, if that route differs from the default assumption. E.g. if the default is public, only specify which routes require authentication, and vice-versa.

## VueUserPlugin

The Vue User Plugin makes it easier to check for authenitcation, to react to auth change events, and helps you to wrap behavior which depends on authentication.

    // Install VueUserPLugin using the normal Vue plugin installation API
    import {VueUserPlugin} from "vue-firebase-auth-plugins";
    Vue.use(VueUserPlugin, { auth: Firebase.auth() });

Usage

    // All Vue instances created after installation will have user available
    {
        data() { return {...} },
        userLoaded() {
            console.log("UID:", this.user.auth.uid);
        }
    }



## postAuthPath

You can set the postAuthPath to a string, or you can use a function that resolves to the path, in case it needs to be dynamically resolved. The function will be called with the router as the first argument and the resolved user as the second.

It supports asynchronous functions in case you need to a do a lookup or fetch some additional data first.

## Changes in 2.x

### User Transformation

In previous versions of the vue-firebase-auth-guard library, there was a pattern to transform or wrap the return Firebase auth object. This created a confusing pattern for developers unfamiliar with what the tool was doing, and created ambiguity between what Firebase Auth provided and what was available on our model.

We no longer transform or "wrap" the underlying firebase auth object. It is exposed directly and separately. We also move away from efforts to replicate, simplify, or wrap any features or data offered by Firebase Auth.

    // Before
    console.log("UID:", this.user.uid);

    // After
    console.log("UID:", this.user.authData.uid);

Instead of wrapping or transforming the user auth, we now affix a "model" to the "user" object returned by VueUserPlugin, like so:

    // Before
    Vue.use(VueUserPlugin, { auth: Firebase.auth(), transformer: (auth) => userAuthPlusModel });

    // After
    Vue.use(VueUserPlugin, { auth: Firebase.auth(), modelBuilder: (userAuth) => userModel });

To add more specificty and clarity, userLoaded has been changed to userModelChanged. So inside of calling components, you'll write your function like this now:

    userModelChanged( user ) {
        // Do something with the user
    }

Likewise, this also means that when the user is logged out the model will be cleared and userModelChanged will be called to indicate the model is gone.