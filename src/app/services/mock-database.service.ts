import { Injectable } from '@angular/core';
import { ColumnDefinition, TableSchema } from '../models/database.models';

const col = (
  id: number,
  name: string,
  dataType: ColumnDefinition['dataType'],
  length = '',
  nullable = true,
  primaryKey = false,
  defaultValue = ''
): ColumnDefinition => ({
  id,
  name,
  dataType,
  length,
  scale: '',
  nullable: primaryKey ? false : nullable,
  defaultValue,
  unique: false,
  indexed: false,
  primaryKey
});

@Injectable({ providedIn: 'root' })
export class MockDatabaseService {
  readonly tables: TableSchema[] = [
    {
      name: 'CUSTOMERS',
      schema: 'APP_OWNER',
      tablespace: 'USERS',
      comment: 'Customer master records',
      columns: [
        { ...col(1, 'CUSTOMER_ID', 'NUMBER', '10', false, true), indexed: true },
        { ...col(2, 'LAST_NAME', 'VARCHAR2', '100', false), indexed: true },
        { ...col(3, 'EMAIL', 'VARCHAR2', '255'), unique: true, indexed: true },
        col(4, 'CREATED_AT', 'TIMESTAMP', '6', true, false, 'SYSTIMESTAMP'),
        col(5, 'ACTIVE_FLG', 'CHAR', '1', true, false, "'Y'")
      ],
      rows: [
        { CUSTOMER_ID: 1001, LAST_NAME: 'Adams', EMAIL: 'adams@example.com', CREATED_AT: '2026-10-01 09:15:00', ACTIVE_FLG: 'Y' },
        { CUSTOMER_ID: 1002, LAST_NAME: 'Bennett', EMAIL: 'bennett@example.com', CREATED_AT: '2026-10-02 12:30:00', ACTIVE_FLG: 'Y' },
        { CUSTOMER_ID: 1003, LAST_NAME: 'Chen', EMAIL: 'chen@example.com', CREATED_AT: '2026-10-04 08:05:00', ACTIVE_FLG: 'N' },
        { CUSTOMER_ID: 1004, LAST_NAME: 'Diaz', EMAIL: 'diaz@example.com', CREATED_AT: '2026-10-06 14:20:00', ACTIVE_FLG: 'Y' }
      ]
    },
    {
      name: 'EMPLOYEES',
      schema: 'APP_OWNER',
      tablespace: 'USERS',
      comment: 'Employee directory',
      columns: [
        col(6, 'EMPLOYEE_ID', 'NUMBER', '10', false, true),
        col(7, 'FIRST_NAME', 'VARCHAR2', '80', false),
        col(8, 'DEPARTMENT', 'VARCHAR2', '60'),
        col(9, 'EMAIL', 'VARCHAR2', '255')
      ],
      rows: [
        { EMPLOYEE_ID: 501, FIRST_NAME: 'Maya', DEPARTMENT: 'Technology', EMAIL: 'maya@example.com' },
        { EMPLOYEE_ID: 502, FIRST_NAME: 'Noah', DEPARTMENT: 'Operations', EMAIL: 'noah@example.com' },
        { EMPLOYEE_ID: 503, FIRST_NAME: 'Olivia', DEPARTMENT: 'Risk', EMAIL: 'olivia@example.com' },
        { EMPLOYEE_ID: 504, FIRST_NAME: 'Liam', DEPARTMENT: 'Finance', EMAIL: 'liam@example.com' }
      ]
    },
    {
      name: 'ORDERS',
      schema: 'APP_OWNER',
      tablespace: 'USERS',
      comment: 'Order records',
      columns: [
        col(10, 'ORDER_ID', 'NUMBER', '10', false, true),
        col(11, 'ORDER_STATUS', 'VARCHAR2', '30', false, false, "'OPEN'"),
        col(12, 'ORDER_TOTAL', 'NUMBER', '12', true)
      ],
      rows: [
        { ORDER_ID: 7001, ORDER_STATUS: 'OPEN', ORDER_TOTAL: 175.5 },
        { ORDER_ID: 7002, ORDER_STATUS: 'CLOSED', ORDER_TOTAL: 89.99 },
        { ORDER_ID: 7003, ORDER_STATUS: 'PENDING', ORDER_TOTAL: 420 },
        { ORDER_ID: 7004, ORDER_STATUS: 'OPEN', ORDER_TOTAL: 67.25 }
      ]
    }
  ];

  tableByName(name: string): TableSchema | undefined {
    return this.tables.find(table => table.name === name);
  }
}
