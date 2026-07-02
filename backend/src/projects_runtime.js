const {
    readLocalProjects,
    writeLocalProjects,
    parseProjectsYaml,
    serializeProjectsYaml,
    mergeFileAssignment,
    mergeProjectAssignment,
    findProjectByBasename,
} = require('./projects.js');

const {
    parseChatMetadataYaml,
    serializeChatMetadataYaml,
    normalizeChatMetadataIndex,
    normalizeChatMetadataEntry,
} = require('./chat_metadata.js');

module.exports = {
    readLocalProjects,
    writeLocalProjects,
    parseProjectsYaml,
    serializeProjectsYaml,
    mergeFileAssignment,
    mergeProjectAssignment,
    findProjectByBasename,
    parseChatMetadataYaml,
    serializeChatMetadataYaml,
    normalizeChatMetadataIndex,
    normalizeChatMetadataEntry,
};
