import Promise from "bluebird";

const MAX_TRANSFORM_WAIT = 1000 * 10;
const UserTransformFailsafe = {
    timeout: null,
    pendingPromise: null,
    time: MAX_TRANSFORM_WAIT,
    newUnresolvedError() {
        return new Error("User Transformation Timed Out. The User Transform promise passed to VueUserPlugin did not resolve or rejected")
    },
    newTimeoutPromise() {
        this.clearOutstanding();
        return new Promise((resolve, reject) => {
            this.timeout = setTimeout(() => {
                reject(this.newUnresolvedError());
            }, UserTransformFailsafe.time);
        });
    },
    start(transformPromise) {
        return Promise.race([
            Promise.resolve(transformPromise),
            this.newTimeoutPromise()
        ])
        .then(result => {
            if(!result) {
                throw this.newUnresolvedError();
            } else {
                this.clearOutstanding();
                return result;
            }
        })
        .catch(err => {
            console.warn("An error occurred while transforming the user");
            console.error(err);
        });
    },
    clearOutstanding() {
        if(this.timeout) {
            clearTimeout(this.timeout);
        }
        this.timeout = null;
    },
    transformSuccess() {
        this.clearOutstanding();
    }
};


/**
 * Makes Firebase.auth.currentUser accessible across every vue instance via user
 * Call Vue.use(VueUserPlugin, { auth: firebase.auth() }) to install
 */
export const VueUserPlugin = {
    user: null,
    onUserLoadedCallbacks: [],

    runUserLoadedCallbacks() {
        var toDelete = [];
        this.onUserLoadedCallbacks.forEach(cb => {
            cb.vm.user = this.user;

            if(cb.callback) {
                cb.callback.call(cb.vm, this.user);

                if(cb.once) {
                    toDelete.push(cb);
                }
            }
        });

        toDelete.forEach(cb => {
            var index = this.onUserLoadedCallbacks.indexOf(cb);
            this.onUserLoadedCallbacks.splice(index, 1);
        });
    },

    /**
     * 
     * @param {*} Vue 
     * @param {*} options - auth, transformer; where the transformer function transforms Firebase's user object 
     */
    install: function(Vue, {auth, transformer, timeout}) {
        var plugin = this;
        UserTransformFailsafe.time = timeout || MAX_TRANSFORM_WAIT;

        auth.onAuthStateChanged((user) => {
            if(user) {
                if(transformer) {
                    return UserTransformFailsafe.start( transformer(user) )
                        .then(tUser => {
                            this.user = tUser;
                            this.runUserLoadedCallbacks();
                        });
                } else {
                    this.user = user;
                    this.runUserLoadedCallbacks();
                }
            } else {
                console.warn("No user. TODO: Add another callback for checkedForUser");
                // this.user = null;
                // this.runUserLoadedCallbacks();
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
                if(this.$options.userLoaded) {
                    if(plugin.user) {
                        this.$data.user = plugin.user;
                        this.$options.userLoaded.call(this, plugin.user);
                    } else {
                        plugin.onUserLoadedCallbacks.push({
                            vm: this,
                            callback: this.$options.userLoaded,
                            once: true
                        });
                    }                    
                } else {
                    if(plugin.user) {
                        this.$data.user = plugin.user;
                    } else {
                        plugin.onUserLoadedCallbacks.push({
                            vm: this,
                            callback: null,
                            once: true
                        });
                    }                     
                }
            }
        });
    }
};

export default VueUserPlugin;