import { index, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

export const scores = pgTable(
  'scores',
  {
    chatId: text('chat_id').notNull(),
    userId: text('user_id').notNull(),
    firstName: text('first_name').notNull(),
    username: text('username'),
    bestScore: integer('best_score').notNull().default(0),
    bestDistance: integer('best_distance').notNull().default(0),
    plays: integer('plays').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.chatId, t.userId] }), index('scores_chat_score_idx').on(t.chatId, t.bestScore)],
)
