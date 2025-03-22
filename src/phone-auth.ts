import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult, PhoneAuthCredential, signInWithCredential, PhoneAuthProvider } from "firebase/auth";
import { FirebaseError } from "@firebase/util";
import { MainAuth, assertMainAuth } from "./auth-state.js";

class PhoneNumberAuthenticatorClass {
    private recaptchaTargetElement?: HTMLElement | string | null;
    recaptchaVerifier : RecaptchaVerifier | null;
    confirmationResult: ConfirmationResult | null;
    recaptchaWidgetId: number | null;

    constructor(recaptchaTargetElement?: HTMLElement | string) {
        this.recaptchaTargetElement = recaptchaTargetElement;
        this.recaptchaWidgetId = null;
        this.recaptchaVerifier = null;
        this.confirmationResult = null;
    }
    setRecaptchaTargetElement(element: HTMLElement | string | null){
        this.recaptchaTargetElement = element;
    }

    async submitPhoneNumber(phoneNumber: string){
        assertMainAuth();

        if(!this.recaptchaVerifier){
            if(this.recaptchaTargetElement){
                try{
                    this.recaptchaVerifier = new RecaptchaVerifier(MainAuth.auth, this.recaptchaTargetElement);
                    this.recaptchaWidgetId = await this.recaptchaVerifier.render();
                }catch(e){
                    throw new Error('Unable to initialize Recaptcha, make sure ContainerId is the Id of the container you will use, and that its already rendered in the DOM');
                }
            }else{
                throw new Error('Recaptcha Verifier has not been setup, make sure to initialize before calling submit, or pass in the containerId');
            }
        }

        try{
            this.confirmationResult = await signInWithPhoneNumber(MainAuth.auth, phoneNumber, this.recaptchaVerifier);
            return { success: true };
        }catch(e){
            console.error('Unable to send SMS Verification:', e);
            return { success: false, reason: MainAuth.convertAuthError((e as FirebaseError).code) };
        }
    }

    async verifyCode(verificationCode: string){
        assertMainAuth();
        if(!this.confirmationResult) throw new Error('Confirmation result isnt ready, make sure the phone number has been successfully submitted first');

        try{
            const result = await this.confirmationResult.confirm(verificationCode);

            return { success: true };
        }catch(e){
            console.error('Unable to verify User Code', e);
            return { success: false, reason: MainAuth.convertAuthError((e as FirebaseError).code) };
        }
    }

    resetCaptcha() {
        assertMainAuth();
        this.recaptchaVerifier = null;
        this.recaptchaWidgetId = null;
        this.confirmationResult = null;
    }

    signInWithVerificationIdAndCode(verificationId: string, code: string){
        assertMainAuth();
        const credential = PhoneAuthProvider.credential(verificationId, code);
        if(!credential) throw new Error('Unable to create PhoneAuthCredential from JSON');
        return signInWithCredential(MainAuth.auth, credential);
    }

}

let instance: PhoneNumberAuthenticatorClass;

export function getPhoneNumberAuthenticator(recaptchaTargetElement?: HTMLElement | string) {
    if(!instance) {
        instance = new PhoneNumberAuthenticatorClass(recaptchaTargetElement);
    }
    return instance;
}