-- The app renders category.icon as text, so icons must be emoji (001 seeded icon names like 'food').
update expense_categories set icon = v.icon
  from (values ('Food', '🍔'), ('Groceries', '🛒'), ('Rent', '🏠'), ('Utilities', '💡'), ('Transport', '🚗'),
               ('Entertainment', '🎬'), ('Shopping', '🛍️'), ('Other', '💰')) as v(name, icon)
 where expense_categories.name = v.name;

update personal_categories set icon = v.icon
  from (values ('Salary', '💼'), ('Freelance', '💻'), ('Other Income', '💵'), ('Food', '🍔'), ('Transport', '🚗'),
               ('Bills', '🧾'), ('Shopping', '🛍️'), ('Health', '💊'), ('Other', '💰')) as v(name, icon)
 where personal_categories.name = v.name;
