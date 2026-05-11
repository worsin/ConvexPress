export type TableNames = string;

export type Id<TableName extends string = string> = string & {
  __tableName: TableName;
};

export type Doc<TableName extends string = string> = {
  _id: Id<TableName>;
  _creationTime: number;
} & Record<string, any>;
