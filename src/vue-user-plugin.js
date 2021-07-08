/*
 *   Copyright (c) 2021 
 *   All rights reserved.
 */
import Promise from "bluebird";

const {CallbackController} = require("./callbacks.js");

/**
 * Makes Firebase.auth.currentUser accessible across every vue instance via user
 * Call Vue.use(VueUserPlugin, { auth: firebase.auth() }) to install
 */
export const VueUserPlugin = {
    user: null,
    onUserModelChangedCallbacks: new CallbackController(),
    onAuthStateChangedCallbacks: new CallbackController(),

    runUserModelChangedCallbacks() {
        return this.onUserModelChangedCallbacks.run(this.user, cb => {
            cb.vm.user = this.user;
        });
    },

    runAuthStateChangedCallbacks() {
        return this.onAuthStateChangedCallbacks.run(this.user.auth(), cb => {
            cb.vm.loggedIn = this.user.loggedIn;
        });
    },

    /**
     * Allows VueUserPlugin to act as a stand-in for Auth in VueFirebaseAuthPlugin
     * Which enables you to use the transformed user in 
     * @param {*} cb 
     */
    onAuthStateChanged(cb) {
        if(this.user) {
            cb(this.user);
        } else {
            plugin.onUserModelChangedCallbacks.add(cb, {
                vm: this,
                once: false
            });          
        }
    },

    /**
     * 
     * @param {*} Vue 
     * @param {*} options - auth, modelBuilder; where the modelBuilder function returns some sort of data structure associated with the user
     */
    install: function(Vue, {auth, modelBuilder}) {
        var plugin = this;
        this.user = {
            auth: () => null,
            authData: null,
            model: null,
            loggedIn: false
        };

        Object.defineProperty(plugin, "currentUser", {
            get() {
                return auth.currentUser;
            }
        });

        var updateUserAuth = (userAuth) => {
            this.user.auth = () => userAuth;
            if(userAuth) {
                var {displayName, email, emailVerified, isAnonymous, metaData, phoneNumber, photoURL, uid} = userAuth;
                this.user.authData = {displayName, email, emailVerified, isAnonymous, metaData, phoneNumber, photoURL, uid};
                this.user.loggedIn = true;
            } else {
                this.user.authData = null;
                this.user.loggedIn = false;
            }
            this.runAuthStateChangedCallbacks();
        };

        var updateModel = (model) => {
            this.user.model = model;
            this.runUserModelChangedCallbacks();
        };

        // Listen for changes to the auth state
        auth.onAuthStateChanged((userAuth) => {
            if(userAuth) {
                updateUserAuth(userAuth);
                if(modelBuilder) {
                    return Promise.resolve( modelBuilder(userAuth) )
                        .then(model => {
                            updateModel(model);
                        });
                }
            } else {
                updateUserAuth(null);
                if(modelBuilder) {
                    updateModel(null);
                }
            }      
        });

        Vue.mixin({
            data() {
                return {
                    user: null
                };
            },
            computed: {
                loggedIn() {
                    return this.user && this.user.loggedIn;
                }
            },
            mounted: function() {
                this.auth = auth;
                if(this.$options.onAuthStateChanged) {
                    plugin.onAuthStateChangedCallbacks.add(this.$options.onAuthStateChanged, {
                        vm: this
                    });
                }
                if(this.$options.userModelChanged) {
                    if(!modelBuilder) {
                        console.warn(`[WARN] userModelChanged hook won't be called since no modelBuilder was provided to VueUserPlugin.`)
                    }
                    plugin.onUserModelChangedCallbacks.add(this.$options.userModelChanged, {
                        vm: this
                    });            
                } else {
                    plugin.onUserModelChangedCallbacks.add(null, {
                        vm: this,
                        once: true
                    });
                }
            }
        });
    }
};

export default VueUserPlugin;