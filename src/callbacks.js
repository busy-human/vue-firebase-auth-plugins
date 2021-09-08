
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
    add(callback, options={ once: false, ignorePreviousCalls: false }) {
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

module.exports.CallbackController = CallbackController;