import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { Octokit } from "@octokit/rest";
const octokit = new Octokit();
import * as fs from "fs";
import * as path from "path";
import { group } from "console";

class ViewModel {
  date: Date;
  data: any;
  constructor(date: Date, data: any) {
    if (Object.prototype.toString.call(date)) {
      date = new Date(date);
    }
    this.date = date;
    this.data = data;
  }
}

async function getIssues(organization: string, repos: string[], label: string) {
  const issuesByRepoPromises = repos.map((repo) => {
    if (label === undefined || label === null || label == "") {
      return octokit.issues
        .listForRepo({
          repo,
          owner: organization,
          labels: "help wanted",
        })
        .then((r) => r.data);
    } else {
     return octokit.issues
        .listForRepo({
          repo,
          owner: organization,
          labels: label,
        })
        .then((r) => r.data);
    }
  });
  try {
    const issuesByRepo = await Promise.all(issuesByRepoPromises);
    return issuesByRepo.reduce((list, item) => list.concat(item), []);
  } catch (Exception) {
    return [];
  }
}

async function processIssues(issues: any) {
  let issueArray = [];
  issues.forEach((issue) => {
    let tempArray = issue.repository_url.split("/");
    let r = {
      repoName: tempArray[tempArray.length - 1],
      issueTitle: issue.title,
      issueUrl: issue.html_url,
    };
    issueArray.push(r);
  });

  const issueMap = issueArray.reduce((m, v) => {
    const repo = v.repoName;
    const entry = m[repo];
    if (typeof entry === "undefined") {
      m[repo] = [v];
    } else {
      entry.push(v);
    }
    return m;
  }, {});

  const groupedIssues = Object.keys(issueMap).map((d) => {
    return {
      repoName: d,
      issues: issueMap[d],
    };
  });

  let model = new ViewModel(new Date(), groupedIssues);
  return model;
}

const httpTrigger: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  var repos: string[] = extractValue(req, "repos");
  var org = extractValue(req, "organization");
  var label = extractValue(req, "label");
  var filepath = `${org}-issues.json`;

  try {
    const data = fs.readFileSync(path.join(__dirname, filepath), {
      encoding: "utf8",
      flag: "r",
    });

    var obj = JSON.parse(data);
    let model = new ViewModel(obj.date, obj.data);
    var now = new Date();
    var diff = now.getTime() - model.date.getTime();
    var hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours > 5) {
      model = await processIssues(await getIssues(org, repos, label));
      fs.writeFileSync(
        path.join(__dirname, filepath),
        JSON.stringify(model),
        "utf8"
      );
      context.res = {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
        body: model.data,
      };
    } else {
      context.res = {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
        body: model.data,
      };
    }
  } catch {
    let model = await processIssues(await getIssues(org, repos, label));
    fs.writeFileSync(
      path.join(__dirname, filepath),
      JSON.stringify(model),
      "utf8"
    );
    context.res = {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: model.data,
    };
  }
};

function extractValue(request: HttpRequest, property: string): any | undefined {
  var v = getValuesFromBody(request, property);

  if (v == null || v.length === 0) {
    return undefined;
  }

  return v;
}

function getValuesFromBody(request: HttpRequest, property: string): any {
  if (request.body && request.body[property]) {
    return request.body[property];
  }

  return null;
}

export default httpTrigger;
