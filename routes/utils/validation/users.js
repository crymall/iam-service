export const roleChangeError = ({ roleId }) =>
  Number.isInteger(Number(roleId)) && Number(roleId) > 0
    ? null
    : "roleId is required";
