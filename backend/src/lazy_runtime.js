// The only bundle that contains heavy AI/MCP/Skill dependencies. Both the
// main preload and custom-window preload load this artifact on demand so the
// release package does not embed the same dependency graph twice.
const {
  createChatCompletion,
  getRandomItem,
  batchTestProviderKeys,
} = require('./chat.js');
const {
  getBuiltinServers,
  invokeBuiltinTool,
  handleBgShellRequest,
  killAllBackgroundShells,
} = require('./mcp_builtin.js');
const {
  initializeMcpClient,
  invokeMcpTool,
  closeMcpClient,
  connectAndFetchTools,
  connectAndInvokeTool,
  ensureMcpAuthenticated,
  getMcpAuthStatus,
} = require('./mcp.js');
const {
  listSkills,
  getSkillDetails,
  generateSkillToolDefinition,
  resolveSkillInvocation,
  saveSkill,
  deleteSkill,
  exportSkillToPackage,
  exportSkillPackageBuffer,
  extractSkillPackage,
  importSkillPackageBuffer,
} = require('./skill.js');
const compactApi = require('./compact.js');
const oauthStore = require('./mcp_oauth_store.js');
const oauthProvider = require('./mcp_oauth_provider.js');

module.exports = {
  createChatCompletion,
  getRandomItem,
  batchTestProviderKeys,
  getBuiltinServers,
  invokeBuiltinTool,
  handleBgShellRequest,
  killAllBackgroundShells,
  initializeMcpClient,
  invokeMcpTool,
  closeMcpClient,
  connectAndFetchTools,
  connectAndInvokeTool,
  ensureMcpAuthenticated,
  getMcpAuthStatus,
  listSkills,
  getSkillDetails,
  generateSkillToolDefinition,
  resolveSkillInvocation,
  saveSkill,
  deleteSkill,
  exportSkillToPackage,
  exportSkillPackageBuffer,
  extractSkillPackage,
  importSkillPackageBuffer,
  oauthStore,
  oauthProvider,
  ...compactApi,
};
