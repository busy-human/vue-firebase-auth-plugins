import Promise from "bluebird";

class CallbackController {
    constructor() {
        this.callbacks = [];
        this.callbacksToDelete = [];
        this.previousCall = null;
    }
    /**
     * 
     * @param {*} callback 
     * @param {*} options 
     * @param {boolean} [options.once] - Whether to run the callback just one time and then unsubscribe it
     * @param {boolean} [options.ignorePreviousCalls] - If there is a previous call this handler missed due to timing of binidng, it will normally call it immediately
     */
    add(callback, options) {
        var callbackMeta = Object.assign({}, { callback }, options);
        this.callbacks.push(callbackMeta);

        // An event occurred prior to binding this listener, send it on
        if(this.previousCall && !options.ignorePreviousCalls) {
            this.runSingleCallback(callbackMeta, this.previousCall.data, this.previousCall.sideEffect);
        }
    }

    /**
     * Run a single callback; used by the .run() call, but also in add for previousCalls
     * @param {*} callbackMeta 
     * @param {*} data 
     * @param {*} sideEffect 
     */
    runSingleCallback(callbackMeta, data, sideEffect) {
        if( ! callbackMeta.__delete) {
            if(sideEffect) {
                sideEffect(callbackMeta, data);
            }
    
            if(callbackMeta.callback) {
                callbackMeta.callback.call(callbackMeta.vm, data);
    
                if(callbackMeta.once) {
                    this.callbacksToDelete.push(callbackMeta);
                    callbackMeta.__delete = true;
                }
            }
        }
    }

    /**
     * Cleanup any callbacks marked for deletion (E.g. single-run callbacks)
     */
    cleanupMarkedCallbacks() {
        this.callbacksToDelete.forEach(cb => {
            var index = this.callbacks.indexOf(cb);
            this.callbacks.splice(index, 1);
        });
    }

    /**
     * 
     * @param {*} data - Data to be passed into the callback functions, if any
     * @param {function} [sideEffect] - A side effect function to run against each registered callback
     */
    run(data, sideEffect) {
        this.callbacks.forEach(cb => {
            this.runSingleCallback(cb, data, sideEffect);
        });

        this.previousCall = { data, sideEffect };

        this.cleanupMarkedCallbacks();
    }  
}

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
        return this.onAuthStateChangedCallbacks.run(this.user.auth());
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
            model: null
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