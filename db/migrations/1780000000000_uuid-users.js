exports.up = (pgm) => {
  pgm.dropConstraint('verification_codes', 'verification_codes_user_id_fkey');

  pgm.addColumns('users', {
    new_id: { type: 'UUID', default: pgm.func('gen_random_uuid()') },
  });
  
  pgm.addColumns('verification_codes', {
    new_user_id: { type: 'UUID' },
  });

  // Since this is meant to be runnable on existing DBs that didn't run the manual script,
  // we would migrate data here. However, the manual script already ran on prod.
  // This migration ensures the schema matches what the manual script did for new environments.
  pgm.sql(`UPDATE users SET new_id = gen_random_uuid() WHERE new_id IS NULL`);
  pgm.sql(`UPDATE verification_codes SET new_user_id = u.new_id FROM users u WHERE user_id = u.id`);

  pgm.dropConstraint('users', 'users_pkey');
  pgm.dropColumn('users', 'id');
  pgm.renameColumn('users', 'new_id', 'id');
  pgm.addConstraint('users', 'users_pkey', { primaryKey: 'id' });

  pgm.dropColumn('verification_codes', 'user_id');
  pgm.renameColumn('verification_codes', 'new_user_id', 'user_id');
  pgm.addConstraint('verification_codes', 'verification_codes_user_id_fkey', {
    foreignKeys: {
      columns: 'user_id',
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
  });
};

exports.down = (pgm) => {
  // Irreversible without mapping back to serial integers safely.
};
