// src/index.ts

import { action, t } from 'bunbase'

const createUser = action({
    name: "createUser",
    input: t.Object({
        name: t.String(),
        email: t.String({ format: "email" }),
    }),
    output: t.Object({
        id: t.String(),
        name: t.String(),
        email: t.String({ format: "email" }),
    }),
}, async (input, ctx) => {
    const data = await ctx.db.from('users').insert(input)
    if (data === null) {
        throw new Error("Failed to create user")
    }
    return {
        id: data.id,
        name: data.name,
        email: data.email
    }
})