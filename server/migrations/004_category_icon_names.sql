-- The app now renders category icons with MaterialCommunityIcons (src/components/CategoryIcon.tsx), so store icon names.
update expense_categories set icon = v.icon
  from (values ('Food', 'food'), ('Groceries', 'cart'), ('Rent', 'home'), ('Utilities', 'lightbulb-on'), ('Transport', 'car'),
               ('Entertainment', 'movie-open'), ('Shopping', 'shopping'), ('Other', 'cash')) as v(name, icon)
 where expense_categories.name = v.name;

update personal_categories set icon = v.icon
  from (values ('Salary', 'briefcase'), ('Freelance', 'laptop'), ('Other Income', 'cash-plus'), ('Food', 'food'), ('Transport', 'car'),
               ('Bills', 'file-document'), ('Shopping', 'shopping'), ('Health', 'pill'), ('Other', 'cash')) as v(name, icon)
 where personal_categories.name = v.name;
