ALTER TABLE employee_advances ADD COLUMN IF NOT EXISTS employee_id TEXT;
CREATE INDEX IF NOT EXISTS idx_advances_employee ON employee_advances(employee_id, entity);

