import { hash } from '@node-rs/argon2'

/** Argon2id-Parameter für alle Passwörter (Anmeldung, Einrichtung, Zurücksetzen). */
export const argonOpts = { memoryCost: 19456, timeCost: 2, parallelism: 1 }

export const hashPassword = (password: string) => hash(password, argonOpts)
