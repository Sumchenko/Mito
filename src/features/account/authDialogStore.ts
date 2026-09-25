import { create } from 'zustand'

export type AuthMode = 'signIn' | 'signUp'

/** The sign-in dialog is rendered once by the shell; anything can open it. */
export const useAuthDialog = create<{ mode: AuthMode | null }>(() => ({ mode: null }))

export const openAuthDialog = (mode: AuthMode = 'signIn') => useAuthDialog.setState({ mode })
export const closeAuthDialog = () => useAuthDialog.setState({ mode: null })
