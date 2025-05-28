import { MainAuth } from "./auth-state";
import { UserModelMap } from "./types";
import { DocumentReference, onSnapshot, Unsubscribe } from "firebase/firestore";

export interface UserModelSnapshotHelperOptions {
    /** Callback for the first snapshot (whether it exists or not) */
    onFirstSnapshot?: (data: any) => void
}

/**
 * Helps set up a firestore snapshot listener for a user model
 * and applies the snapshot to the auth user model.
 */
export function userModelSnapshotHelper (
    reference: DocumentReference,

    options: UserModelSnapshotHelperOptions = {}
) {
    let hasRunFirstSnapshot = false;
    let unsubscribe: Unsubscribe | null = onSnapshot(reference, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            MainAuth.updateUserModelFields(data);
        } else {
            console.warn("Snapshot does not exist for user model:", reference.path);
        }
        if (options.onFirstSnapshot && !hasRunFirstSnapshot) {
            options.onFirstSnapshot(snapshot);
            hasRunFirstSnapshot = true;
        }
    });

    // Cleanup when the user is unauthenticated or user type changes
    MainAuth.onUnAuthenticated(() => {
        if(unsubscribe) {
            unsubscribe();
        }
        unsubscribe = null;
    }, { once: true });

    MainAuth.onUserTypeChanged(() => {
        if(unsubscribe) {
            unsubscribe();
        }
        unsubscribe = null;
    }, { once: true });

    return unsubscribe;
}

