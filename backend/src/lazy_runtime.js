const { createChatCompletion, getRandomItem } = require('./chat.js');
const {
  getBuiltinServers,
  invokeBuiltinTool,
} = require('./mcp_builtin.js');
const {
  initializeMcpClient,
  invokeMcpTool,
  closeMcpClient,
  connectAndFetchTools,
} = require('./mcp.js');
const {
  listSkills,
  getSkillDetails,
  generateSkillToolDefinition,
  resolveSkillInvocation,
  saveSkill,
  deleteSkill,
} = require('./skill.js');

module.exports = {
  createChatCompletion,
  getRandomItem,
  getBuiltinServers,
  invokeBuiltinTool,
  initializeMcpClient,
  invokeMcpTool,
  closeMcpClient,
  connectAndFetchTools,
  listSkills,
  getSkillDetails,
  generateSkillToolDefinition,
  resolveSkillInvocation,
  saveSkill,
  deleteSkill,
};
