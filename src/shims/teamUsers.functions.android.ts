function unavailable(): never {
  throw new Error("إدارة المستخدمين غير متاحة داخل تطبيق أندرويد.");
}

export async function createTeamUser(): Promise<never> {
  unavailable();
}

export async function deletePlayer(): Promise<never> {
  unavailable();
}