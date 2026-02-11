import { module } from 'bunbase'
import { getUsers } from './get-users'
import { createNote } from './create-note'

export default module({
  name: 'users',
  apiPrefix: '/api/users',
  actions: [getUsers, createNote],
})
