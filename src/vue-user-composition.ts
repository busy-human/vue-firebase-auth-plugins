/*
 *   Copyright (c) 2021 Busy Human LLC
 *   All rights reserved.
 *   This file, its contents, concepts, methods, behavior, and operation  (collectively the "Software") are protected by trade secret, patent,  and copyright laws. The use of the Software is governed by a license  agreement. Disclosure of the Software to third parties, in any form,  in whole or in part, is expressly prohibited except as authorized by the license agreement.
 */
import { User as FirebaseUser, ParsedToken as CustomClaimsToken } from "firebase/auth";
import { Ref, ref, computed, ComputedRef} from "vue";
import {CallbackController} from "./callbacks.js";
import { MainAuth, assertMainAuth } from "./auth-state.js";

// Authentication Lifecycle

interface ReadOnlyWrapper<T> {
    ref: Ref<T>,
    readonly: ComputedRef<T>
}

function createReadOnlyWrapper<T>(initialValue: T): ReadOnlyWrapper<T> {
    const _ref = ref(initialValue);
    return {
        ref: _ref as any as Ref<T>,
        readonly: computed(() => _ref.value) as any as ComputedRef<T>
    };
}


interface IGlobals {
    initialized  : boolean;
    user         : ReadOnlyWrapper<FirebaseUser | null>;
    model        : ReadOnlyWrapper<any | null>;
    claims       : ReadOnlyWrapper<CustomClaimsToken | null>;
    authReady    : ReadOnlyWrapper<boolean>;
    uid          : ReadOnlyWrapper<string | null>;
    userType     : ReadOnlyWrapper<string | null>;
    authenticated: ReadOnlyWrapper<boolean>;
    onAuth       : CallbackController<any>;
    onUnauth     : CallbackController<any>;
    onAuthChecked: CallbackController<any>;
}

const globals: IGlobals = {
    initialized   : false,
    user          : createReadOnlyWrapper(null),
    model         : createReadOnlyWrapper(null),
    authenticated : createReadOnlyWrapper(false),
    claims        : createReadOnlyWrapper(null),
    authReady     : createReadOnlyWrapper(false),
    uid           : createReadOnlyWrapper(null),
    userType      : createReadOnlyWrapper(null),
    onAuth        : new CallbackController(),
    onUnauth      : new CallbackController(),
    onAuthChecked : new CallbackController()
};

type IExportedGlobals = Omit<IGlobals, "initialized" | "user" | "model" | "authenticated" | "claims" | "authReady" | "uid" | "userType"> & {
    user         : ComputedRef<FirebaseUser | null>;
    userModel    : Ref<any | null>;
    claims       : ComputedRef<CustomClaimsToken | null>;
    authReady    : ComputedRef<boolean>;
    uid          : ComputedRef<string | null>;
    userType     : ComputedRef<string | null>;
    authenticated: ComputedRef<boolean>;
}


function initialize() {
    assertMainAuth();

    if(!globals.initialized) {
        globals.initialized   = true;
        globals.user.ref.value = null;
        globals.model.ref.value = null;
        globals.authenticated.ref.value = false;
        globals.claims.ref.value = null;
        globals.authReady.ref.value = false;
        globals.uid.ref.value = null;
        globals.userType.ref.value = null;

        MainAuth.onChange((userAuth) => {
            globals.user.ref.value = userAuth.firebaseUser;
            globals.model.ref.value = userAuth.userModel;
            globals.authenticated.ref.value = userAuth.loggedIn;
            globals.claims.ref.value = userAuth.claims;
            globals.uid.ref.value = userAuth.firebaseUser?.uid || null;
            globals.authReady.ref.value = true;
            globals.userType.ref.value = userAuth.userType as string;

            if(userAuth.loggedIn) {
                globals.onAuth.run(globals.user.ref.value);
            } else {
                globals.onUnauth.run(globals.user.ref.value);
            }
        });

        MainAuth.onUserModelChanged((model) => {
            globals.model.ref.value = model;
        });
    }
}

export const VueUserComposition: IExportedGlobals = {
    user          : globals.user.readonly,
    userModel     : globals.model.ref,
    authenticated : globals.authenticated.readonly,
    claims        : globals.claims.readonly,
    authReady     : globals.authReady.readonly,
    uid           : globals.uid.readonly,
    userType      : globals.userType.readonly,
    onAuth        : globals.onAuth,
    onUnauth      : globals.onUnauth,
    onAuthChecked : globals.onAuthChecked,
};

export function useVueUserComposition() {
    initialize();
    return VueUserComposition;
}
