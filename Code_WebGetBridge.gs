/*
 * PMV WEB-APP GET BRIDGE
 *
 * Purpose:
 * Apps Script POST requests can be redirected by the Web App infrastructure.
 * A browser fetch can then report "Failed to fetch" because of the cross-origin
 * redirect/preflight combination.
 *
 * This file provides a GET transport for the same authenticated operations.
 * Add this file to the same Apps Script project as Code.gs.
 *
 * IMPORTANT:
 * It intentionally calls the existing backend functions. It does not replace
 * the daily-report/article logic already present in Code.gs.
 */

function doGet(e) {
  try {
    const p = e && e.parameter ? e.parameter : {};
    const action = clean_(p.action);

    if (!action) {
      return json_({
        status: 'OK',
        service: 'PMV Toolkit Tracker',
        transport: 'GET',
        version: 'Fetch-Fix Bridge',
        date: today_()
      });
    }

    if (action === 'login') {
      return handleLogin_(clean_(p.userId), clean_(p.mobile));
    }

    const session = parseSession_(p.session);
    authenticate_(session);

    switch (action) {
      case 'logout':
        return json_(logout_(session));

      case 'getPmvOpeningBalance':
        return json_(getPmvOpeningBalance_(session, clean_(p.date) || today_()));

      case 'getOwnPmvDashboard':
        return json_(getOwnPmvDashboard_(session, clean_(p.date) || today_()));

      case 'getAdminPmvDashboard':
        requireAdmin_(session);
        return json_(getAdminPmvDashboard_(session, clean_(p.date) || today_()));

      case 'getSpmArticles':
        requireRole_(session, [CONFIG.ROLES.SPM, CONFIG.ROLES.DPS, CONFIG.ROLES.ADMIN]);
        return json_(getSpmArticles_(
          session,
          clean_(p.date) || today_(),
          clean_(p.search || p.q),
          number_(p.limit) || 10000
        ));

      case 'getAdminArticleStatus':
        requireAdmin_(session);
        return json_(getAdminArticleStatus_(
          session,
          clean_(p.date) || today_(),
          clean_(p.search || p.q),
          number_(p.limit) || 10000
        ));

      case 'submitPmvReport':
        return json_(submitPmvReport_(session, parseRecord_(p.record)));

      case 'updateArticleStatus':
        return json_(updateArticleStatus_(session, parseRecord_(p.record)));

      case 'pushArticleStatusToMaster':
        requireAdmin_(session);
        return json_(pushArticleStatusToMaster_(session, parseRecord_(p.record)));

      case 'updateArticleMaster':
        requireAdmin_(session);
        return json_(updateArticleMaster_(session, parseRecord_(p.record)));

      default:
        throw new Error('Unknown GET action: ' + action);
    }
  } catch (err) {
    return error_(err.message || err);
  }
}

function parseRecord_(value) {
  if (!value) return {};
  try {
    return typeof value === 'object' ? value : JSON.parse(value);
  } catch (err) {
    throw new Error('Invalid record JSON.');
  }
}
