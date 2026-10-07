// ============================================================================
//  Acecore QC app – configuration
//  Fill this in once (see README.md). Leave clientId empty to run in demo mode:
//  everything is then stored only on the device itself.
// ============================================================================
export const CONFIG = {
  // Microsoft Entra ID (Azure AD) app registration – "Application (client) ID"
  clientId: '',

  // "Directory (tenant) ID" from the same app registration page,
  // or your domain such as 'acecoretechnologies.com'.
  tenantId: 'organizations',

  // Where builds and photos are stored. Use ONE of the two options:
  //
  // Option A – a sharing link to the QC folder.
  //   In SharePoint/Teams: open the folder > "..." > "Copy link" and paste it here.
  sharepointFolderLink: '',
  //
  // Option B – site + folder path.
  //   sharepointHost:   'acecore.sharepoint.com'
  //   sharepointSite:   'sites/Productie'            (part of the site URL after the host)
  //   sharepointFolder: 'General/QC'                 (folder inside the "Documents" library)
  sharepointHost: '',
  sharepointSite: '',
  sharepointFolder: '',
};

export const DEMO_MODE = !CONFIG.clientId;
