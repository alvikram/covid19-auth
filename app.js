const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
const app = express();

app.use(express.json());

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error : ${e.message}`);
    process.exit(-1);
  }
};

initializeDbAndServer();

const convertStateDbObjectToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDistrictDbObjectToResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

//Authenticate Token
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//User Login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
        SELECT 
            *
        FROM 
            user
        WHERE
            username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API1 - Returns a list of all states in the state table

app.get("/states/", authenticateToken, async (request, response) => {
  const getStatesQuery = `
        SELECT
            *
        FROM
            state;
    `;
  const stateArray = await db.all(getStatesQuery);
  response.send(
    stateArray.map((eachState) =>
      convertStateDbObjectToResponseObject(eachState)
    )
  );
});

//API2- Returns a state based on the state ID
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const selectStateQuery = `
        SELECT 
            *
        FROM
            state
        WHERE
            state_id = '${stateId}';
    `;
  const stateArray = await db.get(selectStateQuery);
  response.send(convertStateDbObjectToResponseObject(stateArray));
});

//API3 -Create a district in the district table,
//district_id is auto-incremented

app.post("/districts/", authenticateToken, async (request, response) => {
  const districtDetails = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetails;

  const addDistrictQuery = `
        INSERT INTO 
            district( district_name, state_id, cases, cured, active, deaths)
        VALUES
            (
                '${districtName}',
                '${stateId}',
                '${cases}',
                '${cured}',
                '${active}',
                '${deaths}'
            );
    `;
  const addDistrict = await db.run(addDistrictQuery);
  response.send("District Successfully Added");
});

//API4-Returns a district based on the district ID

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const selectDistrictQuery = `
        SELECT
            *
        FROM
            district
        WHERE
            district_id = ${districtId};
    `;
    const districtArray = await db.get(selectDistrictQuery);
    response.send(convertDistrictDbObjectToResponseObject(districtArray));
  }
);

//API5 - Deletes a district from the
//district table based on the district ID

app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
        DELETE FROM district
        WHERE district_id = ${districtId};
    `;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

//API6 - Updates the details of a specific district based on the district ID
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const districtDetails = request.body;
    const {
      districtName,
      stateId,
      cases,
      active,
      cured,
      deaths,
    } = districtDetails;

    const updateDistrictQuery = `
        UPDATE
            district
        SET
            district_name = '${districtName}',
            state_id = '${stateId}',
            cases = '${cases}',
            active = '${active}',
            cured = '${cured}',
            deaths = '${deaths}'
        WHERE
            district_id = ${districtId};
    `;
    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

//API7 -Returns the statistics of total cases,
//cured, active, deaths of a specific state based on state ID

app.get("/states/:stateId/stats/", async (request, response) => {
  const { stateId } = request.params;
  const getStatQuery = `
    SELECT
        SUM (cases) AS totalCases,
        SUM (cured) AS totalCured,
        SUM (active) AS totalActive,
        SUM (deaths) AS totalDeaths
        
    FROM
        district
    WHERE 
        state_id = ${stateId}
        ;
  `;
  const statArray = await db.get(getStatQuery);
  response.send(statArray);
});

//API8 - Returns an object containing the
//state name of a district based on the district ID

app.get("/districts/:districtId/details/", async (request, response) => {
  const { districtId } = request.params;
  const getStateNameQuery = `
        SELECT state_name
        FROM state  LEFT JOIN district ON state.state_id = district.state_id
        WHERE district_id = ${districtId};
        `;
  const stateNameArray = await db.all(getStateNameQuery);
  response.send(
    stateNameArray.map((eachState) => ({ stateName: eachState.state_name }))
  );
});

module.exports = app;
