/*
 *   Copyright (c) 2021 Busy Human LLC
 *   All rights reserved.
 *   This file, its contents, concepts, methods, behavior, and operation  (collectively the "Software") are protected by trade secret, patent,  and copyright laws. The use of the Software is governed by a license  agreement. Disclosure of the Software to third parties, in any form,  in whole or in part, is expressly prohibited except as authorized by the license agreement.
 */
import {ref} from "vue";
import {CallbackController} from "./callbacks.js";

// Authentication Lifecycle

const globals = {
    initialized   : false,
    user          : null,
    authenticated : false,
    onAuth        : new CallbackController(),
    onUnauth      : new CallbackController()
};


function initialize(auth) {
    if(!globals.initialized) {
        globals.initialized   = true;
        globals.user          = ref(null);
        globals.authenticated = ref(false);

        auth.onAuthStateChanged((userAuth) => {
            updateUserAuth(userAuth);    
        });        
    }
}

/**
 * 
 * @param {import("firebase").default.UserInfo} firebaseAuth 
 */
function updateUserAuth(firebaseAuth) {
    if(firebaseAuth) {
        globals.user.value = {
            email: firebaseAuth.email,
            uid: firebaseAuth.uid
        };
        return globals.onAuth.run(globals.user.value);

    } else {
        globals.user.value = null;
        return globals.onUnauth.run(globals.user.value);        
    }
}

/**
 * 
 * @param {import("@types/firebase")} auth 
 */
export function VueUserComposition(auth) {
    initialize(auth);
    return {
        user          : globals.user,
        authenticated : globals.authenticated,
        onAuth        : (cb) => globals.onAuth.add(cb),
        onUnauth      : (cb) => globals.onUnauth.add(cb)
    };
}